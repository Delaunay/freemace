"""FreeMace CLI — run the budget server or manage data."""

import argparse
import json
import sys
from pathlib import Path


def cmd_serve(args):
    import uvicorn
    from freemace.server import create_app

    app = create_app(data_dir=args.data_dir)
    uvicorn.run(app, host=args.host, port=args.port)


def cmd_list(args):
    from freemace.server import safe_name

    root = Path(args.data_dir)
    if args.collection:
        folder = root / safe_name(args.collection)
        if not folder.is_dir():
            print(f"No collection '{args.collection}' found.")
            return
        for f in sorted(folder.iterdir()):
            if f.suffix == ".json":
                print(f"  {f.stem}")
    else:
        if not root.is_dir():
            print("No data directory found.")
            return
        for d in sorted(root.iterdir()):
            if d.is_dir():
                count = sum(1 for f in d.iterdir() if f.suffix == ".json")
                print(f"  {d.name} ({count} items)")


def cmd_get(args):
    from freemace.server import safe_name

    path = Path(args.data_dir) / safe_name(args.collection) / (safe_name(args.key) + ".json")
    if not path.is_file():
        print(f"Not found: {args.collection}/{args.key}", file=sys.stderr)
        sys.exit(1)
    with open(path) as f:
        data = json.load(f)
    print(json.dumps(data, indent=2))


def cmd_put(args):
    from freemace.server import safe_name

    folder = Path(args.data_dir) / safe_name(args.collection)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (safe_name(args.key) + ".json")

    if args.file == "-":
        data = json.load(sys.stdin)
    else:
        with open(args.file) as f:
            data = json.load(f)

    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved to {path}")


def cmd_delete(args):
    from freemace.server import safe_name

    path = Path(args.data_dir) / safe_name(args.collection) / (safe_name(args.key) + ".json")
    if path.is_file():
        path.unlink()
        print(f"Deleted {args.collection}/{args.key}")
    else:
        print(f"Not found: {args.collection}/{args.key}", file=sys.stderr)
        sys.exit(1)


def cmd_export(args):
    from freemace.server import safe_name

    path = Path(args.data_dir) / safe_name(args.collection) / (safe_name(args.key) + ".json")
    if not path.is_file():
        print(f"Not found: {args.collection}/{args.key}", file=sys.stderr)
        sys.exit(1)

    with open(path) as f:
        data = json.load(f)

    entries = data.get("entries", [])
    if not entries:
        print("No entries found.", file=sys.stderr)
        sys.exit(1)

    headers = ["date", "amount", "comment", "type", "from", "bank", "details", "adjustment"]
    lines = [",".join(headers)]
    for e in entries:
        row = []
        for h in headers:
            v = str(e.get(h, ""))
            if "," in v or '"' in v:
                v = f'"{v.replace(chr(34), chr(34)+chr(34))}"'
            row.append(v)
        lines.append(",".join(row))

    output = "\n".join(lines)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Exported {len(entries)} entries to {args.output}")
    else:
        print(output)


def main():
    parser = argparse.ArgumentParser(
        prog="freemace",
        description="FreeMace — freelance budgeting tool",
    )
    parser.add_argument(
        "--data-dir", default="data",
        help="Path to the JSON data directory (default: data)",
    )
    sub = parser.add_subparsers(dest="command")

    # serve
    p_serve = sub.add_parser("serve", help="Start the budget server")
    p_serve.add_argument("--host", default="0.0.0.0")
    p_serve.add_argument("--port", type=int, default=5002)
    p_serve.set_defaults(func=cmd_serve)

    # list
    p_list = sub.add_parser("list", help="List collections or keys")
    p_list.add_argument("collection", nargs="?", default=None)
    p_list.set_defaults(func=cmd_list)

    # get
    p_get = sub.add_parser("get", help="Get a stored JSON document")
    p_get.add_argument("collection")
    p_get.add_argument("key")
    p_get.set_defaults(func=cmd_get)

    # put
    p_put = sub.add_parser("put", help="Store a JSON document")
    p_put.add_argument("collection")
    p_put.add_argument("key")
    p_put.add_argument("file", help="JSON file path or '-' for stdin")
    p_put.set_defaults(func=cmd_put)

    # delete
    p_del = sub.add_parser("delete", help="Delete a stored document")
    p_del.add_argument("collection")
    p_del.add_argument("key")
    p_del.set_defaults(func=cmd_delete)

    # export
    p_export = sub.add_parser("export", help="Export budget entries to CSV")
    p_export.add_argument("collection")
    p_export.add_argument("key")
    p_export.add_argument("-o", "--output", help="Output CSV file (default: stdout)")
    p_export.set_defaults(func=cmd_export)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    args.func(args)


if __name__ == "__main__":
    main()
