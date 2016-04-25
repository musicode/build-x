
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

// 需要 build 的节点
var buildNodes = [ ];

// 源文件的 md5
var sourceFileHash = { };

// md5 化的文件的 md5
var outputFileHash = { };

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
            config.sourceHashFile
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

    sourceFileHash = hashMap;

};

// 把文件编译成浏览器可执行的版本
exports.buildFile = function () {

    var dependencyMap = feTree.dependencyMap;
    var reverseDependencyMap = feTree.reverseDependencyMap;

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
                };
                node.onBuildEnd = function () {

                    var file = this.file;
                    var newFile = config.getOutputFile(file);
                    if (file !== newFile) {
                        fileChanges[file] = newFile;
                    }

                    this.onBuildStart =
                    this.onBuildEnd = null;
                };

                buildNodes.push(node);

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

        var promises = buildNodes.map(
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


function hashDependency(isFile) {
    return function (dependency, node) {
        var file = dependency.file;
        var hash = outputFileHash[file];
        // AMD 的模块名必须和文件名保持一致
        if (hash && (isFile ? file === node.file : file !== node.file)) {
            dependency.raw = feTreeUtil.getHashedFile(
                dependency.raw,
                hash
            );
        }
        return dependency;
    };
}

exports.updateReference = function () {

    var prevHashMap = feTreeUtil.readJSON(
        config.outputHashFile
    );

    if (prevHashMap) {
        outputFileHash = prevHashMap;
    }

    var needHash = Array.isArray(config.hashFiles);

    buildNodes.forEach(
        function (node) {
            config.walkNode(node, function (dependency, node) {
                dependency.raw = config.getOutputFile(dependency.raw);
                return dependency;
            });

            outputFileHash[node.file] =
                needHash && feTreeUtil.match(node.file, config.hashFiles)
                ? node.md5
                : null;
        }
    );


    // 到这里生成的是没有任何 md5 的纯净版


    // 给文件的引用添加 md5
    if (needHash) {
        buildNodes.forEach(
            function (node) {
                config.walkNode(node, hashDependency(false));
            }
        );
    }

};

// md5 化整个项目
exports.createHashedFile = function () {

    buildNodes.forEach(
        function (node) {
            config.walkNode(node, hashDependency(true));
            var file = node.file;
            var hash = outputFileHash[file];
            if (hash) {
                feTree.updateFile(
                    feTreeUtil.getHashedFile(file, hash),
                    file
                );
            }
        }
    );

};

exports.outputFile = function () {

    buildNodes.forEach(
        function (node) {
            var file = node.file;
            var md5 = node.md5;
            if (outputedFile[file] !== md5) {
                console.log('输出文件：', file);
                outputedFile[file] = md5;
                fs.createFileSync(file, node.content);
            }
        }
    );

};

exports.complete = function () {

    feTreeUtil.writeJSON(
        config.sourceHashFile,
        sourceFileHash
    );

    feTreeUtil.writeJSON(
        config.outputHashFile,
        outputFileHash
    );

};

