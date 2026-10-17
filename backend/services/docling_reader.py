#!/usr/bin/env python3
"""
Docling PDF Reader & Layout-Aware Structured Parser
Based on Dave Ebbelaar AI Cookbook (knowledge/docling) recipe.
Converts PDF lab manuals into structured Markdown and JSON retaining
headings, tables, apparatus lists, and procedures.
"""

import sys
import os
import json

def parse_with_docling(file_path):
    try:
        from docling.document_converter import DocumentConverter

        if not os.path.isabs(file_path):
            file_path = os.path.abspath(file_path)

        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"File does not exist: {file_path}"
            }

        converter = DocumentConverter()
        result = converter.convert(file_path)

        # Export structured layout-aware markdown
        markdown_content = result.document.export_to_markdown()

        return {
            "success": True,
            "engine": "docling",
            "markdown": markdown_content,
            "file": os.path.basename(file_path),
            "length": len(markdown_content)
        }

    except ImportError:
        return {
            "success": False,
            "error": "Docling is not installed. Please run: pip install docling",
            "fallback": True
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "fallback": True
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python docling_reader.py <path_to_pdf>"
        }))
        sys.exit(1)

    target_pdf = sys.argv[1]
    output = parse_with_docling(target_pdf)
    print(json.dumps(output))
