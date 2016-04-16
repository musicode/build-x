
var argv = require('yargs').argv;
var feTreeUtil = require('fe-tree/lib/util');

var config = require('./config');
var task = require('./task');

config.release = (argv.fast || !argv.release) ? false : true;
config.compareLevel = argv.level ? 2 : 0;

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
