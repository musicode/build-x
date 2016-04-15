
var path = require('path');
var glob = require('glob');
var fs = require('fs-extended');

var Node = require('fe-tree/lib/Node');
var feTree = require('fe-tree');
var feTreeUtil = require('fe-tree/lib/util');

var config = require('./config');

var processors = [
    require('./processor/css'),
    require('./processor/less'),
    require('./processor/stylus'),
    require('./processor/script'),
    require('./processor/amd'),
    require('./processor/html'),
    require('./processor/smarty'),
    require('./processor/other')
];

// 目录级别的 md5
var directoryMap = { };

var counter = config.buildFiles.length;

var totalBenchmark = feTreeUtil.benchmark('总耗时：');
var readBenchmark = feTreeUtil.benchmark('读文件耗时：');

config.buildFiles.forEach(function (pattern) {
    glob(pattern, function (error, files) {

        feTree.parse({
            files: config.filterFiles(files),
            htmlRules: config.htmlRules,
            amdExcludes: config.amdExcludes,
            amdConfig: config.sourceAmdConfig,
            processDependency: config.processDependency
        });

        if (--counter === 0) {
            readBenchmark();
            compareFile();
            compileFile()
            .then(function () {
                updateReference();
                cleanCache();
                outputFile();
                totalBenchmark();
            });
        }

    });
});

// 对比文件变化
function compareFile() {
    var benchmark = feTreeUtil.benchmark('对比文件变化耗时：');

    var hashMap = { };
    var fileInDirectory = { };

    var dependencyMap = feTree.dependencyMap;

    // 排个序，确保顺序不会影响结果
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
        var terms = dirname.split(path.sep);
        var paths = [];
        for (var i = 0, len = terms.length; i < len; i++) {
            paths.push(terms[i]);
            dirname = paths.join(path.sep);
            if (!hashMap[dirname]) {
                hashMap[dirname] = '';
            }
            if (!fileInDirectory[dirname]) {
                fileInDirectory[dirname] = [];
            }
            hashMap[dirname] += node.md5;
            fileInDirectory[dirname].push(file);
        }
    });

    for (var key in hashMap) {
        hashMap[key] = feTreeUtil.md5(
            new Buffer(hashMap[key])
        );
    }

    var prevHashMap = feTreeUtil.readJSON(
        config.directoryMapFile
    );

    if (prevHashMap) {
        var compareLevel = config.compareLevel;
        var changes = [ ];
        for (var key in hashMap) {
            if (key.split(path.sep).length <= compareLevel) {
                var isChange = hashMap[key] !== prevHashMap[key];
                fileInDirectory[key].forEach(function (file) {
                    var node = dependencyMap[file];
                    node.filter = !isChange;
                    if (isChange) {
                        changes.push(file);
                    }
                });
            }
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

    directoryMap = hashMap;

    benchmark();
}

// 把文件编译成浏览器可执行的版本
function compileFile() {
    var benchmark = feTreeUtil.benchmark('编译文件耗时：');

    var dependencyMap = feTree.dependencyMap;
    var reverseDependencyMap = feTree.reverseDependencyMap;

    var tasks = [ ];
    // 按 processor 遍历比较好，可以控制资源的处理顺序
    // 比如先 build 样式，这样 amd 在打包的时候，动态样式资源都是 css 了
    processors.forEach(function (processor) {
        for (var key in dependencyMap) {
            var node = dependencyMap[key];
            if (node.filter) {
                continue;
            }
            if (processor.filter
                && processor.filter(node, dependencyMap, reverseDependencyMap)
            ) {
                break;
            }
            else if (processor.is(node, dependencyMap, reverseDependencyMap)) {
                tasks.push([node, processor]);
            }
        }
    });

    var promises = [ ];

    var fileChanges = { };
    var addFileChange = function (file) {
        var newFile = config.getOutputFile(file);
        if (file !== newFile) {
            fileChanges[file] = newFile;
        }
    };

    tasks.forEach(function (task) {
        var node = task[0];
        var processor = task[1];

        console.log('正在编译：' + node.file);

        var oldContent = node.content;
        var promise = processor.build(node, dependencyMap, reverseDependencyMap);

        var buildComplete = function () {
            addFileChange(node.file);
            if (node.content !== oldContent) {
                // build 完之后内容不一样，需要更新依赖
                node.children.length = 0;
                config.walkNode(node, function (dependency, node) {
                    var file = dependency.file;
                    var child = dependencyMap[file];
                    if (child) {
                        addFileChange(file);
                        feTree.addChild(node, child, dependency.async);
                    }
                });
            }
        };

        if (promise && promise.then) {
            promises.push(promise);
            promise.then(buildComplete);
        }
        else {
            buildComplete();
        }
    });

    return new Promise(function (resolve) {
        var complete = function () {
            for (var key in fileChanges) {
                feTree.updateFile(fileChanges[key], key);
            }
            benchmark();
            resolve();
        };
        if (promises.length) {
            Promise
            .all(promises)
            .then(complete);
        }
        else {
            complete();
        }
    });

}

// 替换所有需要输出的文件的引用
// 这个版本是可以上线的，只是会有缓存问题
function updateReference() {
    var benchmark = feTreeUtil.benchmark('更新引用路径耗时：');
    var dependencyMap = feTree.dependencyMap;

    for (var key in dependencyMap) {
        var node = dependencyMap[key];
        if (node.file.startsWith(config.outputDir)) {
            config.walkNode(node, function (dependency, node) {
                var dependency = config.processDependency(dependency, node);
                if (!dependency) {
                    return;
                }
                dependency.raw = config.getOutputFile(dependency.raw);
                return dependency;
            });
        }
    }
    benchmark();
}

// md5 化整个项目
function cleanCache() {
    var benchmark = feTreeUtil.benchmark('添加 md5 耗时：');
    var dependencyMap = feTree.dependencyMap;

    var files = Object.keys(dependencyMap).filter(function (file) {
        return file.startsWith(config.outputSrcDir);
    });

    feTree.md5({
        nodes: files.map(function (file) {
            return dependencyMap[file];
        }),
        htmlRules: config.htmlRules,
        amdExcludes: config.amdExcludes,
        amdConfig: config.outputAmdConfig,
        processDependency: config.processDependency
    });

    // 修改模板里的引用
    for (var key in dependencyMap) {
        var node = dependencyMap[key];
        if (node.file.startsWith(config.outputViewDir)) {
            config.walkNode(node, function (dependency, node) {
                var dependencyNode = dependencyMap[dependency.file];
                if (!dependencyNode) {
                    console.log(dependency, node.file);
                    return;
                }
                dependency.raw = feTreeUtil.getHashedFile(
                    dependency.raw,
                    dependencyNode.calculate()
                );
                return dependency;
            });
        }
    }

    benchmark();
}

function outputFile() {
    var benchmark = feTreeUtil.benchmark('写文件耗时：');
    var dependencyMap = feTree.dependencyMap;
    for (var key in dependencyMap) {
        var node = dependencyMap[key];
        if (node.file.startsWith(config.outputDir)) {
            fs.createFileSync(node.file, node.content);
        }
    }
    feTreeUtil.writeJSON(
        config.directoryMapFile,
        directoryMap
    );
    benchmark();
}
