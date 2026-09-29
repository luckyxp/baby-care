#!/bin/sh
# 扫描源码中的 U+FFFD 替换字符（写入过程偶发损坏），输出 文件:行号:内容
grep -rn $'\xef\xbf\xbd' src tests docs index.html README.md 2>/dev/null
