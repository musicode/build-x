
var path = require('path');
var argv = require('yargs').argv;
var feTreeUtil = require('fe-tree/lib/util');

var config = require('./config');
var task = require('./task');

// 是否压缩（较慢）
config.release = (argv.fast || !argv.release) ? false : true;
// 是否全量 build
config.total = argv.total ? true : false;
// 对比文件的目录深度
config.compareLevel = argv.compareLevel || 0;
// 目录 hash 文件存放位置，便于下次 build 进行对比
config.hashFile = argv.hashFile || path.join(config.projectDir, 'hash.json')

var totalBenchmark = feTreeUtil.benchmark('总耗时：');


var benchmark = feTreeUtil.benchmark('读文件耗时：');
task.parseSourceTree()
.then(function () {
    benchmark();


    benchmark = feTreeUtil.benchmark('对比文件变化耗时：');
    task.compareFile();
    benchmark();


    benchmark = feTreeUtil.benchmark('编译文件耗时：');
    task.buildFile()
    .then(function () {
        benchmark();


        benchmark = feTreeUtil.benchmark('更新引用路径耗时：');
        task.updateReference();
        benchmark();

        benchmark = feTreeUtil.benchmark('添加 md5 耗时：');
        task.cleanCache();
        benchmark();

        benchmark = feTreeUtil.benchmark('写文件耗时：');
        task.outputFile();
        benchmark();

        totalBenchmark();
    });
});
