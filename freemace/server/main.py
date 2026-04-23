"""FreeMace CLI — run the budget server or manage data."""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path


def _resolve_data_dir(args) -> str:
    """Use --data-dir if given, otherwise fall back to config."""
    if getattr(args, "data_dir", None) and args.data_dir != "data":
        return args.data_dir
    cfg = _load_cfg(args)
    return cfg.get("data_dir", args.data_dir)


def _load_cfg(args) -> dict:
    from freemace.server import load_config
    return load_config(getattr(args, "config", None))


# ── serve ─────────────────────────────────────────────────

def cmd_serve(args):
    import uvicorn
    from freemace.server import create_app

    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")

    data_dir = _resolve_data_dir(args)
    app = create_app(data_dir=data_dir, config_path=args.config)
    uvicorn.run(app, host=args.host, port=args.port)


# ── data commands ─────────────────────────────────────────

def cmd_list(args):
    from freemace.server import safe_name

    root = Path(_resolve_data_dir(args))
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

    path = Path(_resolve_data_dir(args)) / safe_name(args.collection) / (safe_name(args.key) + ".json")
    if not path.is_file():
        print(f"Not found: {args.collection}/{args.key}", file=sys.stderr)
        sys.exit(1)
    with open(path) as f:
        data = json.load(f)
    print(json.dumps(data, indent=2))


def cmd_put(args):
    from freemace.server import safe_name

    folder = Path(_resolve_data_dir(args)) / safe_name(args.collection)
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

    path = Path(_resolve_data_dir(args)) / safe_name(args.collection) / (safe_name(args.key) + ".json")
    if path.is_file():
        path.unlink()
        print(f"Deleted {args.collection}/{args.key}")
    else:
        print(f"Not found: {args.collection}/{args.key}", file=sys.stderr)
        sys.exit(1)


def cmd_export(args):
    from freemace.server import safe_name

    path = Path(_resolve_data_dir(args)) / safe_name(args.collection) / (safe_name(args.key) + ".json")
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


# ── setup-git ─────────────────────────────────────────────

def cmd_setup_git(args):
    from freemace.server.gitsync import git_init, git_sync

    data_dir = Path(_resolve_data_dir(args))
    remote = args.remote or None

    git_init(data_dir, remote)
    print(f"Git initialised in {data_dir}")
    if remote:
        print(f"Remote: {remote}")

    if args.config:
        from freemace.server import load_config, save_config
        cfg = load_config(args.config)
        if remote:
            cfg["git_remote"] = remote
        save_config(args.config, cfg)
        print(f"Config updated: {args.config}")

    sha = git_sync(data_dir)
    if sha:
        print(f"Initial commit: {sha}")


# ── update ────────────────────────────────────────────────

def cmd_update(args):
    from freemace.server.updater import (
        get_latest_version, needs_update, do_upgrade, restart_service,
    )
    import freemace

    print(f"Current version: {freemace.__version__}")
    latest = get_latest_version()
    if latest is None:
        print("Could not check PyPI.", file=sys.stderr)
        sys.exit(1)
    print(f"Latest on PyPI:  {latest}")

    if not needs_update(latest):
        print("Already up to date.")
        return

    print(f"Upgrading {freemace.__version__} -> {latest}...")
    ok, out = do_upgrade()
    if not ok:
        print(f"Upgrade failed:\n{out}", file=sys.stderr)
        sys.exit(1)
    print("Upgrade successful.")

    if args.restart:
        print("Restarting service...")
        rok, rout = restart_service()
        if rok:
            print("Service restarted.")
        else:
            print(f"Restart failed: {rout}", file=sys.stderr)


# ── config ────────────────────────────────────────────────

def cmd_config(args):
    from freemace.server import load_config, save_config

    cfg = load_config(args.config)

    if args.key and args.value is not None:
        val = args.value
        if val.lower() in ("true", "false"):
            val = val.lower() == "true"
        else:
            try:
                val = int(val)
            except ValueError:
                try:
                    val = float(val)
                except ValueError:
                    pass
        cfg[args.key] = val
        save_config(args.config, cfg)
        print(f"{args.key} = {val}")
    elif args.key:
        v = cfg.get(args.key, "<not set>")
        print(f"{args.key} = {v}")
    else:
        for k, v in sorted(cfg.items()):
            print(f"  {k} = {v}")


# ── main ──────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="freemace",
        description="FreeMace — freelance budgeting tool",
    )
    parser.add_argument(
        "--data-dir", default="data",
        help="Path to the JSON data directory (default: data)",
    )
    parser.add_argument(
        "--config", default=None,
        help="Path to config.json (default: none)",
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

    # setup-git
    p_git = sub.add_parser("setup-git", help="Initialise git backup for data")
    p_git.add_argument("remote", nargs="?", default=None,
                       help="Git remote URL (e.g. git@github.com:user/freemace-data.git)")
    p_git.set_defaults(func=cmd_setup_git)

    # update
    p_upd = sub.add_parser("update", help="Check for and install updates from PyPI")
    p_upd.add_argument("--restart", action="store_true",
                       help="Restart the systemd service after upgrade")
    p_upd.set_defaults(func=cmd_update)

    # config
    p_cfg = sub.add_parser("config", help="View or set configuration")
    p_cfg.add_argument("key", nargs="?", default=None, help="Config key to get/set")
    p_cfg.add_argument("value", nargs="?", default=None, help="Value to set")
    p_cfg.set_defaults(func=cmd_config)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    args.func(args)


if __name__ == "__main__":
    main()
