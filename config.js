var fs = require('fs');
var path = require('path');

var feTreeRule = require('fe-tree/lib/rule');
var feTreeUtil = require('fe-tree/lib/util');

var srcName = 'src';
var outputSrcName = 'asset';

var projectDir = '/Users/zhujl/github/marketing'//path.join(__dirname, '..');
var srcDir = path.join(projectDir, srcName);

var outputDir = path.join(projectDir, 'output');
var outputSrcDir = path.join(outputDir, outputSrcName);

exports.projectDir = projectDir;
exports.outputDir = outputDir;

exports.directoryHashFile = null;
exports.release = false;

// 对比目录的深度，最小为 0
exports.compareLevel = 2;

// 页面文件，比如 smarty 模板、或 index.html、main.html、app.html 等
exports.pageFiles = [
    path.join(projectDir, 'view/**/*.*'),
    path.join(projectDir, 'add.html'),
    path.join(projectDir, 'list.html'),
    path.join(projectDir, 'couponAdd.html'),
    path.join(projectDir, 'couponDetail.html'),
    path.join(projectDir, 'couponGrant.html'),
    path.join(projectDir, 'couponList.html'),
    path.join(projectDir, 'couponSend.html'),
    path.join(projectDir, 'delegate.html'),
    path.join(projectDir, 'coupon-m/*.html'),
    path.join(projectDir, 'discount-m/*.html')
];

// 静态资源
exports.staticFiles = [
    //path.join(srcDir, '**/*.*'),
    path.join(projectDir, 'dep/**/*.*'),
];

// 给静态资源添加 md5
exports.hashFiles = [
    path.join(outputSrcDir, '**/*.*')
];

var filterFiles = [
    '**/test/**/*',
    '**/testcases/**/*',
    '**/doc/**/*',
    '**/demo*',
    '**/demo/**/*',
    '**/demo-files/**/*',
    '**/*.as',
    '**/*.fla',
    '**/*.psd',
    '**/edp-*',
    '**/README.md',
    '**/readme.md',
    '**/Read Me.txt',
    '**/package.json',
    '**/module.conf',

];

exports.filterFiles = function (files) {
    return files.filter(function (file) {
        if (Array.isArray(filterFiles)) {
            if (feTreeUtil.match(file, filterFiles)) {
                return false;
            }
        }
        return /\.[a-z]+/i.test(
            path.extname(file)
        );
    });
};

// 需要过滤的依赖
var filterDependencies = [
    '**/hermes/**/*.*',
    '**/course/classList.js',
    '**/activity/paper/step3.png',
    '**/echarts/**/*.js',
    '**/zrender/**/*.js',
    '**/zrender.js'
];

// 文件路径中有这些字符就认为是无法解析的
var illegalCharInFilePath = /[\${}]/;

var sourcePrefix2Dir = {
    '{{ $static_origin }}/': projectDir,
    '/src/': srcDir,
    'src/': srcDir,
};

var outputPrefix2Dir = {
    '{{ $static_origin }}/': outputDir,
    '/asset/': outputSrcDir,
    'asset/': outputSrcDir,
};

function getDependencyFile(dependency, node) {
    var raw = dependency.raw;
    var file = dependency.file;
    if (node.extname === '.styl'
        && /^[a-z]/i.test(raw)
    ) {
        var suffix = dependency.extname || '';
        var testFiles = [
            path.join(projectDir, raw) + suffix,
            path.join(projectDir, 'src', raw) + suffix
        ];
        for (var i = 0, len = testFiles.length; i < len; i++) {
            if (fs.existsSync(testFiles[i])) {
                file = testFiles[i];
                break;
            }
        }
    }
    return file;
}

var amdPlugins = [
    'jquery', 'html', 'text', 'tpl', 'css', 'js'
];

// 不需要按 amd 处理的文件
// 不解析语法树不知道是否是 AMD 模块，因此通过配置分辨
exports.amdExcludes = [
    '**/echarts/**/*.js',
    '**/zrender/**/*.js',
    '**/zrender.js',
    '**/ueditor/**/*.js'
];

exports.htmlRules = [
    {
        // 匹配如下格式：
        // {{ $amd_modules = 'xx' }}
        // {{ $amd_modules = [ 'xx', 'yy' ] }}
        // {{ $amd_modules[] = 'xx' }}
        pattern: /\{\{ \$(?:amd_modules|amd_more|static_more|script_path)(?:\[\])?\s*=\s*([^}]+) \}\}/g,
        match: function (result, file, amdConfig) {
            var terms = result.substring(3, result.length - 3).split('=');
            var id = terms[1].trim();
            if (id.startsWith('$')) {
                return;
            }
            return feTreeRule.parseAmdDependencies(
                id,
                amdConfig
            );
        }
    }
];

var extnameMap = {
    '.less': '.css',
    '.styl': '.css'
};

exports.getOutputFile = function (file) {

    if (file.startsWith(outputDir)) {
        return file;
    }

    if (file.startsWith(projectDir)) {
        var relativePath = path.relative(projectDir, file);
        file = path.join(outputDir, relativePath);
    }

    file = feTreeUtil.replace(
        file,
        new RegExp('\\b' + srcName + '\\b', 'g'),
        function ($0) {
            return $0.replace(srcName, outputSrcName);
        }
    );

    var extname = path.extname(file).toLowerCase();
    if (extnameMap[extname]) {
        file = feTreeUtil.removeExtname(file) + extnameMap[extname];
    }

    return file;
};

exports.getOutputAmdConfig = function (data) {

    var config = { };

    for (var key in data) {
        config[key] = data[key];
    }

    if (data.baseUrl) {
        config.baseUrl = exports.getOutputFile(data.baseUrl);
    }

    var paths = data.paths;
    if (paths) {
        config.paths = { };
        for (var key in paths) {
            config.paths[key] = feTreeUtil.isAbsoluteUrl(paths[key])
                ? paths[key]
                : exports.getOutputFile(paths[key]);
        }
    }

    var packages = data.packages;
    if (packages) {
        config.packages = [ ];
        packages.forEach(function (pkg) {
            config.packages.push({
                name: pkg.name,
                main: pkg.main,
                location: feTreeUtil.isAbsoluteUrl(pkg.location)
                        ? pkg.location
                        : exports.getOutputFile(pkg.location)
            })
        });

    }

    return config;

};


exports.sourceAmdConfig = {
    baseUrl: srcDir,
    paths: { },
    packages: [
        {
            name: 'cobble',
            location: '../dep/cobble/0.3.28/src',
            main: 'main'
        },
        {
            name: 'moment',
            location: '../dep/moment/2.7.0/src',
            main: 'moment'
        },
        {
            name: 'imageCrop',
            location: '../dep/image-crop/0.0.1/src',
            main: 'imageCrop'
        },
        {
            name: 'underscore',
            location: '../dep/underscore/1.6.0/src',
            main: 'underscore'
        },
        {
            name: 'audioPlayer',
            location: '../dep/audioPlayer/0.0.1/src',
            main: 'audioPlayer'
        },
        {
            name: 'TextClipboard',
            location: '../dep/TextClipboard/0.0.3/src',
            main: 'TextClipboard'
        },
        {
            name: 'echarts',
            location: '../dep/echarts/2.1.10/src',
            main: 'echarts'
        },
        {
            name: 'cc',
            location: '../dep/cc/1.0.0/src',
            main: 'main'
        },
        {
            name: 'custom',
            location: '../dep/cc/1.0.0/custom'
        },
        {
            name: 'SwfStore',
            location: '../dep/SwfStore/0.0.1/src',
            main: 'SwfStore'
        }
    ]
};

exports.outputAmdConfig = exports.getOutputAmdConfig(
    exports.sourceAmdConfig
);

exports.processDependency = function (dependency, node) {

    var raw = dependency.raw;
    var file = dependency.file;

    if (feTreeUtil.isAbsoluteUrl(raw)) {
        return;
    }

    if (!file) {

        var prefix2Dir = node.file.startsWith(outputDir)
            ? outputPrefix2Dir
            : sourcePrefix2Dir;

        if (prefix2Dir) {
            for (var prefix in prefix2Dir) {
                if (raw.indexOf(prefix) === 0) {
                    file = path.join(
                        prefix2Dir[prefix],
                        raw.substr(prefix.length)
                    );
                    break;
                }
            }
        }

        if (!file) {
            file = getDependencyFile(dependency, node);
        }

        if (!file && feTreeUtil.isRelativePath(raw)) {
            file = path.join(
                path.dirname(node.file),
                raw
            );
            if (dependency.extname) {
                file += dependency.extname;
            }
        }

        if (file) {
            dependency.file = file;
        }

    }

    var matched = !!file;
    if (matched
        && Array.isArray(filterDependencies)
    ) {
        if (feTreeUtil.match(file, filterDependencies)) {
            matched = false;
        }
    }

    if (!matched) {
        return;
    }

    if (illegalCharInFilePath
        && illegalCharInFilePath.test(file)
    ) {
        return;
    }

    if (dependency.amd) {

        var rawExclude = {
            require: 1,
            exports: 1,
            module: 1
        };

        var module = dependency.module;
        if ((amdPlugins && amdPlugins.indexOf(module) >= 0)
            || rawExclude[raw]
        ) {
            return;
        }

    }
if (file.endsWith('/novip.png')) {
    console.log(dependency, node.file);
}
    return dependency;
};

exports.walkNode = function (node, processDependency) {
    node.walk({
        htmlRules: exports.htmlRules,
        cssRules: exports.cssRules,
        amdExcludes: exports.amdExcludes,
        amdConfig: node.file.startsWith(outputDir)
            ? exports.outputAmdConfig
            : exports.sourceAmdConfig,
        processDependency: function (dependency, node) {
            dependency = exports.processDependency(dependency, node);
            if (!dependency) {
                return;
            }
            return processDependency
                ? processDependency(dependency, node)
                : dependency;
        }
    });
};
