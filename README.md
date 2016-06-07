# build-x

# 简介

build-x 是一个不依赖 task-runner 的前端项目构建工具。

支持：

1. AMD
2. less
3. stylus

用 build-x 一共有四种构建模式：

1. 不压缩、全量构建 `node build-x/index.js --release=0 --total=1`
2. 不压缩、增量构建 `node build-x/index.js --release=0 --total=0`
3. 压缩、全量构建 `node build-x/index.js --release=1 --total=1`
4. 压缩、增量构建 `node build-x/index.js --release=1 --total=0`

为了解决大项目构建速度问题，我们设计了增量构建的选项，这不是一个完美的解决方案，但是一个可以解决问题的方案。

增量构建需要知道静态资源的依赖关系，即谁被谁依赖，谁依赖了谁。

对于 less 和 stylus 这种动态样式语言，我们不想在文件对比阶段用语言自身提供的语法树分析依赖（可能会很慢），因此为了保证能成功分析依赖关系，建议使用如下 CSS 语法：

* `@import [url]`
* `url([url])`

这样不论使用哪种动态样式语言，或者使用纯 CSS，都可以分析出依赖关系。

在增量构建中，为了获取历史文件的 md5，我们设计了两个 md5 文件路径：

* sourceHashFile `命令行选项 --sourceHashFile=xxx`
* outputHashFile `命令行选项 --outputHashFile=xxx`

sourceHashFile 用于增量构建时的文件对比，如果文件没有变化，则跳过。

outputHashFile 用于存储构建后的文件 md5，便于输出 md5 化的文件。

## 配置

我们的设计初衷是，不同的项目只需要修改 build-x/config.js 即可，因此在这个文件中，包含了大量的配置项。

### projectName

项目名称。

比如你希望构建出来的目录是下面这样的，可以配置 projectName 为 `baidu`。

```
- projectDir
  - outputDir
    - baidu
      - asset
      - dep
      - view
```

### srcName

项目源码目录名称，通常是 `src`。

### outputSrcName

项目源码目录的输出名称。通常为了看起来专业，输出名称不会也叫作 `src`。

### depName

项目依赖库目录，通常是 `dep`。

### outputDepName

项目依赖库目录的输出名称。

### outputName

项目构建输出目录名称。

### projectDir

项目目录。注意是绝对路径。

### pageFiles

项目中的页面文件，即用户可以直接打开访问的页面。

### staticFiles

项目中的静态资源文件。

通过配置页面文件，其实可以分析出用到的静态资源文件，但也有例外，比如非 AMD 文件，或者源码中的文件路径是通过拼变量实现的。这种情况下，构建工具无能为力，只能手动配置要构建哪些文件。

### hashFiles

需要 md5 化的文件。

并非所有文件都需要 md5 化，比如页面文件，或者通过版本号控制的库文件。

### filterFiles

不需要构建的文件。

### filterDependencies

不需要构建的依赖。

比如我们在一个 AMD 模块加载了一个第三方库，开发时是正常工作的，但是构建时却挂了，这时我们可以配置不要构建这个库。

这里的依赖指的是文件中对其他文件的引用。

### replaceContent

每个资源处理器构建完成之后会自动调用 replaceContent 函数，用于全局替换，比如添加时间戳。

### amdPlugins

项目用到的 AMD 插件名称。

### amdExcludes

不需要按 AMD 模块处理的文件。

对于一个 AMD 项目来说，大部分文件都是 AMD 模块，但也可能存在少部分不是 AMD 模块，这时需要手动配置，否则构建工具需要构建之后才知道，浪费性能。

### sourceAmdConfig

源码的 amd config
