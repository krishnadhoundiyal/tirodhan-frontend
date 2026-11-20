"""Check the review maps against FastAPI source at an explicit backend commit."""

import argparse
import ast
import json
import re
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend_checkout", type=Path)
    parser.add_argument("commit", help="Reviewed backend commit")
    args = parser.parse_args()

    def git(*command):
        return subprocess.check_output(
            ["git", "-C", str(args.backend_checkout), *command], text=True
        )

    commit = git("rev-parse", "--verify", args.commit + "^{commit}").strip()

    def source(path):
        return git("show", f"{commit}:src/tirodhan/{path}")

    registrations = source("api/router.py")
    modules = set(re.findall(r"api_router\.include_router\((\w+)\.router\)", registrations))
    # V2 routers are mounted conditionally in the application factory.
    for module, name in re.findall(
        r"from tirodhan\.api\.routes\.(\w+) import router as (\w+)",
        factory := source("main.py"),
    ):
        if f"application.include_router({name})" in factory:
            modules.add(module)

    registered = set()
    for module in sorted(modules):
        tree = ast.parse(source(f"api/routes/{module}.py"))
        prefix = next(
            (
                ast.literal_eval(keyword.value)
                for node in tree.body
                if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == "router" for target in node.targets)
                and isinstance(node.value, ast.Call)
                for keyword in node.value.keywords
                if keyword.arg == "prefix"
            ),
            "",
        )
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or not decorator.args:
                    continue
                fn = decorator.func
                if (
                    isinstance(fn, ast.Attribute)
                    and isinstance(fn.value, ast.Name)
                    and fn.value.id == "router"
                    and fn.attr in {"get", "post", "put", "patch", "delete"}
                ):
                    registered.add((fn.attr.upper(), prefix + ast.literal_eval(decorator.args[0])))

    directory = Path(__file__).resolve().parent
    business = json.loads((directory / "business-operations.nonprod.json").read_text("utf-8"))
    features = json.loads((directory / "feature-operations.nonprod.json").read_text("utf-8"))
    groups = [("/v1", business["business_operations"])]
    groups.extend((item["api_prefix"], item["operations"]) for item in features.values())

    def matches(actual, template):
        actual_segments = actual.split("/")
        template_segments = template.split("/")
        return len(actual_segments) == len(template_segments) and all(
            a == b or (b.startswith("{") and not a.startswith("{"))
            for a, b in zip(actual_segments, template_segments)
        )

    missing = []
    for prefix, operations in groups:
        for key, operation in operations.items():
            path = prefix + operation["path"]
            if not any(
                method == operation["method"] and matches(path, template)
                for method, template in registered
            ):
                missing.append(f"{key}: {operation['method']} {path}")
    if missing:
        raise SystemExit("Missing backend declarations:\n" + "\n".join(missing))
    print(f"Verified {sum(len(operations) for _, operations in groups)} route declarations at {commit}")


if __name__ == "__main__":
    main()
