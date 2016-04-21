
var path = require('path');
var glob = require('glob');
var fs = require('fs-extended');

var Node = require('fe-tree/lib/Node');
var feTree = require('fe-tree');
var feTreeUtil = require('fe-tree/lib/util');

var config = require('./config');

var cssProcessor = require('./processor/css');
var lessProcessor = require('./processor/less');
var stylusProcessor = require('./processor/stylus');
var scriptProcessor = require('./processor/script');
var amdProcessor = require('./processor/amd');
var htmlProcessor = require('./processor/html');
var pageProcessor = require('./processor/page');
var otherProcessor = require('./processor/other');

// 所有文件的 md5
var fileHash = { };

// 已经输出过的文件
var outputedFile = { };

// 生成源文件的树
exports.parseSourceTree = function () {

    return new Promise(function (resolve) {

        var files = feTreeUtil.merge(
            config.pageFiles,
            config.staticFiles
        );

        var counter = files.length;

        files.forEach(function (pattern) {
            glob(pattern, function (error, files) {

                feTree.parse({
                    files: config.filterFiles(files),
                    htmlRules: config.htmlRules,
                    amdExcludes: config.amdExcludes,
                    amdConfig: config.sourceAmdConfig,
                    processDependency: config.processDependency
                });

                if (--counter === 0) {
                    resolve();
                }

            });
        });

    });

};

// 对比文件变化
exports.compareFile = function () {

    var dependencyMap = feTree.dependencyMap;

    var hashMap = { };
    for (var key in dependencyMap) {
        hashMap[key] = dependencyMap[key].md5;
    }

    if (!config.total) {

        var prevHashMap = feTreeUtil.readJSON(
            config.hashFile
        );

        if (prevHashMap) {

            var changes = [ ];

            for (var key in hashMap) {
                var isChange = hashMap[key] !== prevHashMap[key];
                if (isChange) {
                    changes.push(key);
                }
                else {
                    dependencyMap[key].filter = true;
                }
            }

            var updateChange = function (changes) {
                changes.forEach(function (file) {
                    dependencyMap[file].filter = false;
                    var changes = feTree.reverseDependencyMap[file];
                    if (changes) {
                        updateChange(changes);
                    }
                });
            };

            updateChange(changes);
        }

    }

    fileHash = hashMap;

};

// 把文件编译成浏览器可执行的版本
exports.buildFile = function () {

    var dependencyMap = feTree.dependencyMap;
    var reverseDependencyMap = feTree.reverseDependencyMap;

    var nodes = [ ];

    var fileChanges = { };

    for (var key in dependencyMap) {
        var node = dependencyMap[key];
        if (node.filter) {
            continue;
        }

        var matched = false;

        [
            cssProcessor,
            lessProcessor,
            stylusProcessor,
            scriptProcessor,
            amdProcessor,
            htmlProcessor,
            pageProcessor,
            otherProcessor
        ].forEach(function (processor, index) {
            if (matched) {
                return;
            }

            if (processor.filter
                && processor.filter(node, dependencyMap, reverseDependencyMap)
            ) {
                matched = true;
            }
            else if (processor.is
                && processor.is(node, dependencyMap, reverseDependencyMap)
                && processor.build
            ) {
                matched = true;

                node.buildContent = function () {
                    return processor.build(this, dependencyMap, reverseDependencyMap);
                };
                node.onBuildStart = function () {
                    console.log('正在编译：' + this.file, index);
                    this.prevContent = this.content;
                };
                node.onBuildEnd = function () {

                    var file = this.file;
                    var newFile = config.getOutputFile(file);
                    if (file !== newFile) {
                        fileChanges[file] = newFile;
                    }

                    if (this.content !== this.prevContent) {
                        // build 完之后内容不一样，需要更新依赖
                        this.children.length = 0;
                        config.walkNode(this, function (dependency, node) {
                            var file = dependency.file;
                            var child = dependencyMap[file];
                            if (child) {
                                feTree.addChild(node, child, dependency.async);
                            }
                        });
                    }
                };

                nodes.push(node);

                // 归类
                var processorNodes = processor.nodes;
                if (!Array.isArray(processorNodes)) {
                    processorNodes = processor.nodes = [ ];
                }
                processorNodes.push(node);

            }
        });
    }

    return new Promise(function (resolve) {

        var promises = nodes.map(
            function (node) {
                return node.build();
            }
        );

        Promise.all(promises).then(
            function () {
                for (var key in fileChanges) {
                    feTree.updateFile(fileChanges[key], key);
                }
                resolve();
            }
        );

    });

};

// 替换所有需要输出的文件的引用
// 这个版本是可以上线的，只是会有缓存问题
exports.updateReference = function () {

    var dependencyMap = feTree.dependencyMap;

    for (var key in dependencyMap) {
        var node = dependencyMap[key];
        if (node.file.indexOf(config.outputDir) === 0) {
            config.walkNode(node, function (dependency, node) {
                dependency.raw = config.getOutputFile(dependency.raw);
                return dependency;
            });
        }
    }

};

// md5 化整个项目
exports.cleanCache = function () {

    // 需要替换依赖引用的节点
    var rootFileMap = { };

    // 需要 md5 化的节点
    var hashFileMap = { };

    var dependencyMap = feTree.dependencyMap;
    for (var key in dependencyMap) {
        if (Array.isArray(config.hashFiles)
            && feTreeUtil.match(key, config.hashFiles)
        ) {
            rootFileMap[key] =
            hashFileMap[key] = dependencyMap[key];
        }
    }

    var pageNodes = pageProcessor.nodes;
    if (Array.isArray(pageNodes) && pageNodes.length > 0) {
        pageNodes.forEach(function (node) {
            rootFileMap[node.file] = node;
        });
    }

    var buildNodes = [ ];

    var buildDependency = function (dependency, node, different, same) {
        var file = dependency.file;
        var dependencyNode = hashFileMap[file];
        if (dependencyNode) {
            if (file !== node.file) {
                return different && different(dependency, dependencyNode);
            }
            else {
                return same && same(dependency, dependencyNode);
            }
        }
    };

    var hashMap = { };
    var getNodeHash = function (node) {
        var hash = hashMap[node.file];
        if (!hash) {
            hash = hashMap[node.file] = node.md5;
        }
        return hash;
    };

    var fileChanges = { };

    var updateDependency = function (dependency, dependencyNode) {
        dependency.raw = feTreeUtil.getHashedFile(
            dependency.raw,
            getNodeHash(dependencyNode)
        );
        fileChanges[dependencyNode.file] = feTreeUtil.getHashedFile(
            dependencyNode.file,
            getNodeHash(dependencyNode)
        );
        return dependency;
    };



    for (var key in rootFileMap) {
        var node = rootFileMap[key];
        node.onBuildStart = node.onBuildEnd = null;
        node.buildContent = function () {
            var node = this;
            return new Promise(function (resolve) {
                var promises = [ ];
                config.walkNode(node, function (dependency, node) {
                    return buildDependency(
                        dependency,
                        node,
                        updateDependency,
                        function (dependency, dependencyNode) {
                            promises.push(
                                new Promise(function (resolve) {
                                    config.walkNode(node, function (dependency, node) {
                                        return buildDependency(
                                            dependency,
                                            node,
                                            null,
                                            updateDependency
                                        );
                                    });
                                    resolve();
                                })
                            );
                        }
                    );
                });

                if (promises.length > 0) {
                    Promise.all(promises)
                    .then(resolve);
                }
                else {
                    resolve();
                }

            });
        };
        buildNodes.push(node);
    }

    return new Promise(function (resolve) {

        var promises = buildNodes.map(
            function (node) {
                return node.build();
            }
        );

        Promise.all(promises)
        .then(function () {
            for (var key in fileChanges) {
                feTree.updateFile(
                    fileChanges[key],
                    key
                );
            }
            resolve();
        });
    });

};

exports.outputFile = function () {

    var dependencyMap = feTree.dependencyMap;
    for (var key in dependencyMap) {
        var node = dependencyMap[key];
        var file = node.file;
        var md5 = node.md5;
        if (outputedFile[file] !== md5
            && file.indexOf(config.outputDir) === 0
        ) {
            console.log('输出文件', file);
            outputedFile[file] = md5;
            fs.createFileSync(file, node.content);
        }
    }

};

exports.complete = function () {

    feTreeUtil.writeJSON(
        config.hashFile,
        fileHash
    );

};

