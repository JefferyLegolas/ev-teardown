#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 three.cjs + 三个源码文件内联进单个 index.html（可离线双击打开）。"""
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / "src"
OUT = BASE / "index.html"

tpl = (SRC / "template.html").read_text(encoding="utf-8")
three = (BASE / "vendor" / "three.cjs").read_text(encoding="utf-8")
app_parts = [(SRC / f).read_text(encoding="utf-8") for f in ("core.js", "model.js", "ui.js")]
app = "\n".join(app_parts)

assert "</script" not in three.lower(), "three.cjs 含有 </script>，需要转义"
assert "</script" not in app.lower(), "app 源码含有 </script>，需要转义"

three_wrapped = (
    "window.THREE = {};\n"
    "(function (exports) {\n"
    + three
    + "\n})(window.THREE);\n"
)

html = tpl.replace("/*__THREE__*/", three_wrapped).replace("/*__APP__*/", app)
OUT.write_text(html, encoding="utf-8")
print(f"built {OUT}  ({len(html)/1024/1024:.2f} MB)")
