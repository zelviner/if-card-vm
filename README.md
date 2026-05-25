# IF Card VM

IF CardScript 是一门面向智能卡自动化的脚本语言：前端包括词法分析、Pratt Parser、AST 建模，后端包含字节码编译器、栈式虚拟机以及 PC/SC 读卡器驱动。开发者可以用类 C 语法描述 ATR 校验与 APDU 用例，再由运行时驱动真实读卡器完成验证。

- **源码→字节码→执行**：源码经 `frontend` 词法/语法分析生成 AST，再由 `backend/compiler` 编译为自定义指令，由 `backend/vm` 执行。
- **丰富运行时类型**：整数、浮点、布尔、字符串、列表、字典、闭包、内置函数全部在 `backend/object` 中实现，支持方法调用、可迭代、深拷贝。
- **智能卡一等语法**：使用 `APDU -> expect` 或 `RST -> expect` 即可发包校验，期望值支持 `null`、字符串、候选列表。
- **可视化调试**：`lexer/parser` 测试会导出 JSON（`test/lexer/tokens.json`, `test/parser/ast.json`），便于检查 Token 和 AST。
- **REPL 与集成测试**：`repl` 提供命令行交互，`vm_test` 能直接驱动 PC/SC 读卡器执行 `script/code.txt`。

> 目录内的中文注释与示例默认使用 UTF-8 编码，Windows/MSVC 通过 `/utf-8` 选项强制统一字符集。


## 核心特性

- **语言要素**：`int/float/bool/string/null/list/hash`，支持复合赋值、三目操作、索引/属性访问、链式方法、闭包。
- **控制流**：`if/else`, `while`, `for`, `foreach`, `switch/case/default`, `break/continue`, `return`，解析优先级详见 `Parser::Precedence`。
- **运行时内置函数**：`print`, `type`, `len`, `int`, `float`, `str`, `exit`, `RST`。对象额外暴露 `string.split/replace/...`、`list.append/extend/...`、`hash.keys/update/...` 等方法。
- **读卡器抽象**：`card_reader` 模块封装 PC/SC 接口，后续可以扩展 QSC/SCSC。VM 的 `CARD` 指令直接调用读卡器 reset/transmit。
- **工具链友好**：CMake 最低 3.14，支持 vcpkg toolchain（`CGEAR_HOME` 环境变量时自动配置），提供安装/导出目标。

## 架构速览

```
src/
├─ frontend/
│  ├─ lexer/token          # 词法分析、Token 定义
│  ├─ parser               # Pratt Parser 与语句解析
│  └─ ast                  # AST 节点，可导出 JSON
├─ backend/
│  ├─ code                 # 指令描述与编码
│  ├─ compiler             # AST → 字节码 (闭包/作用域/层级)
│  ├─ vm                   # 栈式虚拟机，执行 Code::Opcode
│  ├─ object               # 运行时对象、内置函数及方法
│  ├─ symbol_table/scope   # 符号解析、作用域指令缓冲
│  └─ layer/frame          # 循环层级与执行帧
├─ card_reader/            # CardReader 接口与 PC/SC 实现
├─ utility/json            # 简易 JSON 库，用于导出 Tokens/AST
├─ script/                 # 默认脚本与演示
└─ test/                   # REPL / 编译器 / VM 等集成测试
```

## 快速开始

### 先决条件

- CMake ≥ 3.14。
- C++17 编译器（Windows/MSVC、Clang、GCC 均可）。
- GTest（建议通过 vcpkg 安装；若设置 `CGEAR_HOME`，会自动定位 `$CGEAR_HOME/scripts/buildsystems/vcpkg.cmake` 并补全前缀）。
- Windows PC/SC 驱动（链接 `Winscard`，需实际读卡器用于 VM 测试）。

### 构建

```powershell
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release `
      -G "Ninja"                               # 可替换为 VS/MSBuild
cmake --build build --target card_script
```

构建产物默认输出到 `lib/`、`bin/`。若需安装：

```powershell
cmake --install build
```

### 运行测试

```powershell
cmake --build build --target lexer_test parser_test compiler_test vm_test
ctest --test-dir build --output-on-failure
```

> `vm_test` 会尝试连接真实读卡器。若当前无硬件，可只运行 `lexer/parser/compiler`。

## 测试与调试

- `test/script/script.hpp` 中的 `script_dir`、`test_path` 需要根据本地路径调整，`script/code.txt` 为默认脚本。
- `lexer_test` 在 `test/lexer/tokens.json` 输出 Token 集；`parser_test` 会将 AST 以 JSON 形式保存到 `test/parser/ast.json`。
- `compiler_test` 可打印指令序列，`vm_test` 则执行完整的“解析→编译→VM→读卡器”链路。
- 通过在 `compiler->show()`、`vm->show()` 取消注释可查看指令/栈信息。

## 语言/脚本示例

`script/code.txt` 中的示例：

```cardscript
atr = RST -> null
print("ATR值：", atr, "type:", type(atr))
if atr != "3BF813000010000073C84013009000" {
    print("是我期望的ATR值")
} else {
    print("不是我期望的ATR值")
}
```

更多用法：

```cardscript
aid = "00A4040008A000000151000000"
rsp = aid -> ["9000", "61??"]    // 允许多种期望 sw

if rsp.sw == "9000" {
    data = rsp.data
    print("Select OK:", data)
} else {
    print("Unexpected SW:", rsp.sw)
}

list = [1, 2, 3]
list.append(4)
foreach (idx, value in list) {
    print(idx, value)
}
```

REPL（`bin/repl.exe`）可用于交互式调试，每条输入都会走“解析→编译→执行”流程，非 `null` 结果会直接打印。

### 常用语法速览

```cardscript
// if / else
if balance > 0 && status == true {
    print("available")
} else {
    print("blocked")
}

// while
i = 0
while i < 3 {
    print("loop", i)
    i += 1
}

// for (init; condition; step)
for (j = 0; j < 5; j += 1) {
    print("for", j)
}

// foreach
data = ["A", "B", "C"]
foreach (idx, value in data) {
    print(idx, value)
}

// switch / case / default
switch (sw) {
case "9000": print("OK")
case "6A82": print("file not found")
default:     print("unknown sw:", sw)
}

// 函数

```

## 目录结构

```
.
├─ CMakeLists.txt          # 顶层构建配置
├─ src/                    # CardScript 语言实现
├─ test/                   # GTest 集成用例与 REPL
├─ script/                 # 默认脚本
├─ build/                  # (生成) 构建输出
├─ bin/                    # (生成) 可执行文件
├─ lib/                    # (生成) 库文件
└─ doc/                    # 代码风格等文档
```

## TODO

1. 实现 `CardReaderFactory` 中 QSC/SCSC 后端，支持网络读卡器。
2. 将脚本目录配置移出 `test/script/script.hpp` 的硬编码，改为 CLI 参数或配置文件。
3. 扩展 `card` 语法期望类型（如按位掩码、自定义回调）并改进错误提示。
4. 增加更多容器方法（排序、过滤）和格式化工具函数。
5. 引入 CI（GitHub Actions 等）自动执行 `cmake + ctest`。

## 贡献指南

1. Fork 本仓库并克隆到本地。
2. 运行 `cmake -S . -B build` 初始化构建，修改 `doc/cpp_naming_style.md` 中约定的命名/格式。
3. 本地运行 `cmake --build build --target card_script && ctest`，如涉及读卡器，请说明使用硬件型号。
4. 提交 Pull Request 时附上变更说明、测试方法与结果（需要时包含生成的 JSON/日志）。