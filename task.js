
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

// 目录级别的 md5
var directoryHash = { };

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

}

// 对比文件变化
exports.compareFile = function () {

    var hashMap = { };
    var fileInDirectory = { };

    var dependencyMap = feTree.dependencyMap;

    // 先排序，确保顺序不会影响结果
    var files = Object.keys(dependencyMap).sort(function (a, b) {
        if (a > b) {
            return 1;
        }
        else if (a < b) {
            return -1;
        }
        return 0;
    });

    files.forEach(function (file) {
        var node = dependencyMap[file];
        var dirname = path.relative(
            config.projectDir,
            path.dirname(file)
        );
        if (!hashMap[dirname]) {
            hashMap[dirname] = '';
        }
        hashMap[dirname] += node.md5;
        if (!fileInDirectory[dirname]) {
            fileInDirectory[dirname] = [ ];
        }
        fileInDirectory[dirname].push(file);
    });

    for (var key in hashMap) {
        hashMap[key] = feTreeUtil.md5(
            new Buffer(hashMap[key])
        );
    }

    if (!config.total) {

        var prevHashMap = feTreeUtil.readJSON(
            config.hashFile
        );

        if (prevHashMap) {
            var changes = [ ];
            for (var key in hashMap) {
                var isChange = hashMap[key] !== prevHashMap[key];
                fileInDirectory[key].forEach(function (file) {
                    var node = dependencyMap[file];
                    node.filter = !isChange;
                    if (isChange && changes.indexOf(file) < 0) {
                        changes.push(file);
                    }
                });
            }

            // 变化的文件会导致父文件变化
            var reverseDependencyMap = feTree.reverseDependencyMap;
            var updateChange = function (changes) {
                changes.forEach(function (file) {
                    dependencyMap[file].filter = false;
                    var changes = reverseDependencyMap[file];
                    if (changes) {
                        updateChange(changes);
                    }
                });
            };

            updateChange(changes);
        }

    }

    directoryHash = hashMap;

}

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

}

// 替换所有需要输出的文件的引用
// 这个版本是可以上线的，只是会有缓存问题
exports.updateReference = function () {

    var dependencyMap = feTree.dependencyMap;

    for (var key in dependencyMap) {
        var node = dependencyMap[key];
        if (node.file.startsWith(config.outputDir)) {
            config.walkNode(node, function (dependency, node) {
                dependency.raw = config.getOutputFile(dependency.raw);
                return dependency;
            });
        }
    }

}

// md5 化整个项目
exports.cleanCache = function () {
    //feTree.debug = true;

    var dependencyMap = feTree.dependencyMap;

    var files = Object.keys(dependencyMap).filter(function (file) {

        var matched = false;

        if (Array.isArray(config.hashFiles)
            && feTreeUtil.match(file, config.hashFiles)
        ) {
            matched = true;
        }

        return matched;

    });

    feTree.md5({
        nodes: files.map(function (file) {
            return dependencyMap[file];
        }),
        htmlRules: config.htmlRules,
        amdExcludes: config.amdExcludes,
        amdConfig: config.outputAmdConfig,
        processDependency: function (dependency, node) {
            var dependency = config.processDependency(dependency, node);
            if (dependency && dependencyMap[dependency.file]) {
                return dependency;
            }
        }
    });

    // 修改模板里的引用
    var pageNodes = pageProcessor.nodes;
    if (Array.isArray(pageNodes)) {
        pageNodes.forEach(function (node) {
            config.walkNode(node, function (dependency, node) {
                var dependencyNode = dependencyMap[dependency.file];
                if (dependencyNode) {
                    dependency.raw = feTreeUtil.getHashedFile(
                        dependency.raw,
                        dependencyNode.calculate()
                    );
                    return dependency;
                }
            });
        });
    }

}

exports.outputFile = function () {

    var dependencyMap = feTree.dependencyMap;
    for (var key in dependencyMap) {
        var node = dependencyMap[key];
        if (node.file.startsWith(config.outputDir)) {
            console.log('输出文件', node.file);
            fs.createFileSync(node.file, node.content);
        }
    }

    feTreeUtil.writeJSON(
        config.hashFile,
        directoryHash
    );

}
