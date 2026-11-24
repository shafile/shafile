#!/usr/bin/env python3
"""Cross-platform Shafile deployment helper.

Targets:
  container  Build and run the Node.js app with Docker/Podman (or WSL on Windows)
  tunnel     Container deployment plus a Cloudflare Tunnel sidecar
  cloudflare Deploy the OpenNext Worker, D1 migrations, and Worker secrets

The script never prints secret values and does not pass secrets on the command line.
"""

from __future__ import annotations

import argparse
import getpass
import os
import re
import secrets
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
ENV_EXAMPLE = ROOT / ".env.example"
DRY_RUN = False


class DeployError(RuntimeError):
    pass


def info(message: str) -> None:
    print(f"[shafile] {message}")


def warn(message: str) -> None:
    print(f"[shafile] warning: {message}", file=sys.stderr)


def die(message: str) -> None:
    print(f"[shafile] error: {message}", file=sys.stderr)
    raise SystemExit(1)


def command_text(args: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in args)


def run(
    args: list[str],
    *,
    cwd: Path = ROOT,
    env: dict[str, str] | None = None,
    input_text: str | None = None,
    capture: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    info(f"$ {command_text(args)}")
    if DRY_RUN:
        return subprocess.CompletedProcess(args, 0, "", "")
    try:
        return subprocess.run(
            args,
            cwd=str(cwd),
            env=env,
            input=input_text,
            text=True,
            capture_output=capture,
            check=check,
        )
    except FileNotFoundError as error:
        raise DeployError(f"command not found: {args[0]}") from error
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or "").strip()
        raise DeployError(
            f"command failed with exit code {error.returncode}: {command_text(args)}"
            + (f"\n{detail}" if detail else "")
        ) from error


def read_lines() -> list[str]:
    if ENV_FILE.exists():
        return ENV_FILE.read_text(encoding="utf-8").splitlines()
    if ENV_EXAMPLE.exists():
        return ENV_EXAMPLE.read_text(encoding="utf-8").splitlines()
    return []


def read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in read_lines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def write_env(values: dict[str, str]) -> None:
    lines = read_lines()
    output: list[str] = []
    seen: set[str] = set()
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in values:
                output.append(f"{key}={values[key]}")
                seen.add(key)
                continue
        output.append(line)
    for key, value in values.items():
        if key not in seen:
            output.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
    try:
        ENV_FILE.chmod(0o600)
    except OSError:
        pass


def persist_env(key: str, value: str) -> None:
    values = read_env()
    values[key] = value
    write_env(values)


def env_or_envfile(key: str) -> str | None:
    value = os.environ.get(key, "").strip()
    if value:
        return value
    value = read_env().get(key, "").strip()
    return value or None


def prompt(label: str, *, secret: bool = False, non_interactive: bool) -> str:
    if non_interactive:
        die(f"{label} is required; set it in the environment or run interactively")
    if secret:
        value = getpass.getpass(f"{label}: ").strip()
    else:
        value = input(f"{label}: ").strip()
    if not value:
        die(f"{label} is required")
    return value


def ensure_secret(
    key: str,
    *,
    non_interactive: bool,
    generate: bool = True,
) -> tuple[str, bool]:
    existing = env_or_envfile(key)
    if existing:
        return existing, False
    if not generate:
        return prompt(key, secret=True, non_interactive=non_interactive), True
    value = secrets.token_urlsafe(32)
    persist_env(key, value)
    info(f"generated {key} in {ENV_FILE}")
    return value, True


def ensure_pnpm() -> str:
    for candidate in ("pnpm.cmd", "pnpm"):
        path = shutil.which(candidate)
        if path:
            return path
    die("pnpm was not found. Install Node.js 22+ and enable pnpm first.")


def ensure_env_for_container(*, tunnel: bool, non_interactive: bool) -> None:
    values = read_env()
    for key in ("TICKET_SECRET", "IP_HASH_SECRET"):
        if not values.get(key) or values[key] in {"change-me", "replace-with-a-random-secret"}:
            values[key] = secrets.token_urlsafe(32)
            info(f"generated {key} in {ENV_FILE}")
    values.setdefault("TRUST_PROXY", "true" if tunnel else "false")
    if tunnel:
        token = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "").strip() or values.get(
            "CLOUDFLARE_TUNNEL_TOKEN", ""
        ).strip()
        if not token:
            token = prompt(
                "CLOUDFLARE_TUNNEL_TOKEN (Cloudflare Zero Trust tunnel token)",
                secret=True,
                non_interactive=non_interactive,
            )
        values["CLOUDFLARE_TUNNEL_TOKEN"] = token
    write_env(values)


def compose_prefix(backend: str) -> list[str]:
    if backend == "docker":
        candidates = [["docker", "compose"], ["docker-compose"]]
    elif backend == "podman":
        candidates = [["podman", "compose"], ["podman-compose"]]
    elif backend == "nerdctl":
        candidates = [["nerdctl", "compose"]]
    else:
        raise DeployError(f"unknown container backend: {backend}")
    for candidate in candidates:
        if not shutil.which(candidate[0]):
            continue
        probe = subprocess.run(
            [*candidate, "version"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        if probe.returncode == 0:
            return candidate
    raise DeployError(
        f"{backend} Compose is not available. Install {backend} and its Compose provider."
    )


def make_native_backend(requested: str | None) -> ContainerBackend:
    if requested and requested != "auto":
        if requested == "wslc":
            die("wslc is only available on Windows")
        return ContainerBackend(requested)
    failures: list[str] = []
    for candidate in ("podman", "docker", "nerdctl"):
        if not shutil.which(candidate):
            continue
        try:
            return ContainerBackend(candidate)
        except DeployError as error:
            failures.append(str(error))
    detail = "\n".join(failures) if failures else "install podman or docker"
    die(f"no usable container backend found:\n{detail}")


class ContainerBackend:
    def __init__(self, name: str) -> None:
        self.name = name
        self.prefix = compose_prefix(name)

    def run(self, args: list[str], *, capture: bool = False) -> None:
        run(
            [*self.prefix, *args],
            cwd=ROOT,
            capture=capture,
        )


class WslBackend:
    name = "wslc"

    def __init__(self) -> None:
        self.wsl = shutil.which("wsl.exe") or shutil.which("wsl")
        if not self.wsl:
            die("wsl.exe was not found. Install WSL or pass --backend docker/podman.")
        try:
            self.root = subprocess.run(
                [self.wsl, "wslpath", "-a", str(ROOT)],
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip()
        except (OSError, subprocess.CalledProcessError) as error:
            raise DeployError(f"WSL is not usable: {error}") from error
        if not self.root:
            die("could not resolve the project path inside WSL")
        self.prefix = self._detect_compose()

    def _detect_compose(self) -> list[str]:
        script = (
            "if docker compose version >/dev/null 2>&1; then echo docker; "
            "elif podman compose version >/dev/null 2>&1; then echo podman; "
            "elif command -v podman-compose >/dev/null 2>&1; then echo podman-compose; "
            "elif nerdctl compose version >/dev/null 2>&1; then echo nerdctl; "
            "fi"
        )
        probe = subprocess.run(
            [self.wsl, "-e", "bash", "-lc", script],
            capture_output=True,
            text=True,
        )
        value = probe.stdout.strip()
        if value == "docker":
            return ["docker", "compose"]
        if value == "podman":
            return ["podman", "compose"]
        if value == "podman-compose":
            return ["podman-compose"]
        if value == "nerdctl":
            return ["nerdctl", "compose"]
        die(
            "no Compose runtime was found inside WSL. Install Docker or Podman in WSL, "
            "or pass --backend docker/podman on Windows."
        )
        raise AssertionError("unreachable")

    def run(self, args: list[str], *, capture: bool = False) -> None:
        command = f"cd {shlex.quote(self.root)} && {command_text([*self.prefix, *args])}"
        run([self.wsl, "-e", "bash", "-lc", command], cwd=ROOT, capture=capture)


def make_backend(requested: str | None) -> ContainerBackend | WslBackend:
    if os.name == "nt":
        if requested in (None, "auto", "wslc"):
            return WslBackend()
        return make_native_backend(requested)
    if requested == "wslc":
        die("wslc is only available on Windows")
    return make_native_backend(requested)


def wait_for_health(timeout: int = 90) -> None:
    url = "http://127.0.0.1:3000/api/health"
    info(f"waiting for {url}")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200:
                    info("health check passed")
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(2)
    warn("health check did not pass within the timeout; inspect logs with --action logs")


def deploy_container(args: argparse.Namespace) -> None:
    tunnel = args.target == "tunnel"
    if args.action == "up":
        ensure_env_for_container(
            tunnel=tunnel,
            non_interactive=args.non_interactive,
        )
    backend = make_backend(args.backend)
    info(f"container backend: {backend.name}")
    files = ["-f", "docker-compose.yml"]
    if tunnel:
        files += ["-f", "docker-compose.cloudflare.yml"]
    if args.action == "up":
        backend.run([*files, "up", "-d", "--build"])
        wait_for_health()
        info("Shafile is running at http://localhost:3000")
    elif args.action == "down":
        backend.run([*files, "down"])
    elif args.action == "logs":
        command = [*files, "logs", "--tail=200"]
        if args.follow:
            command.append("-f")
        backend.run(command)
    elif args.action == "status":
        backend.run([*files, "ps"])
    else:
        die(f"unsupported container action: {args.action}")


def read_wrangler_config() -> str:
    path = ROOT / "wrangler.jsonc"
    if not path.exists():
        die("wrangler.jsonc is missing")
    return path.read_text(encoding="utf-8")


def write_wrangler_config(content: str) -> None:
    (ROOT / "wrangler.jsonc").write_text(content, encoding="utf-8")


def ensure_wrangler_resources(non_interactive: bool) -> None:
    content = read_wrangler_config()
    d1_match = re.search(r'"database_id"\s*:\s*"([^"]*)"', content)
    if not d1_match or d1_match.group(1).startswith("REPLACE"):
        d1_id = os.environ.get("D1_DATABASE_ID", "").strip() or prompt(
            "Cloudflare D1 database_id",
            non_interactive=non_interactive,
        )
        if d1_match:
            content = re.sub(
                r'("database_id"\s*:\s*")[^"]*(")',
                rf"\g<1>{d1_id}\g<2>",
                content,
                count=1,
            )
        else:
            die("could not find d1_databases[].database_id in wrangler.jsonc")

    bucket_match = re.search(r'"bucket_name"\s*:\s*"([^"]*)"', content)
    if not bucket_match:
        die("could not find r2_buckets[].bucket_name in wrangler.jsonc")
    if bucket_match.group(1).startswith("REPLACE"):
        bucket = os.environ.get("R2_BUCKET", "").strip() or prompt(
            "Cloudflare R2 bucket name",
            non_interactive=non_interactive,
        )
        content = re.sub(
            r'("bucket_name"\s*:\s*")[^"]*(")',
            rf"\g<1>{bucket}\g<2>",
            content,
            count=1,
        )
    write_wrangler_config(content)


def deploy_cloudflare(args: argparse.Namespace) -> None:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        token = prompt(
            "CLOUDFLARE_API_TOKEN",
            secret=True,
            non_interactive=args.non_interactive,
        )
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if not account:
        account = prompt(
            "CLOUDFLARE_ACCOUNT_ID",
            non_interactive=args.non_interactive,
        )

    ensure_wrangler_resources(args.non_interactive)
    app_secrets: dict[str, str] = {}
    for key in ("TICKET_SECRET", "IP_HASH_SECRET", "CRON_SECRET"):
        value, _ = ensure_secret(key, non_interactive=args.non_interactive)
        app_secrets[key] = value

    pnpm = ensure_pnpm()
    cf_env = os.environ.copy()
    cf_env["CLOUDFLARE_API_TOKEN"] = token
    cf_env["CLOUDFLARE_ACCOUNT_ID"] = account

    if not args.skip_install:
        run([pnpm, "install", "--frozen-lockfile"], cwd=ROOT)

    run([pnpm, "cf:build"], cwd=ROOT, env=cf_env)
    run(
        [pnpm, "exec", "wrangler", "d1", "migrations", "apply", "shafile-db", "--remote"],
        cwd=ROOT,
        env=cf_env,
    )
    for key, value in app_secrets.items():
        run(
            [pnpm, "exec", "wrangler", "secret", "put", key],
            cwd=ROOT,
            env=cf_env,
            input_text=value,
        )
    run(
        [pnpm, "exec", "wrangler", "deploy", "--keep-vars"],
        cwd=ROOT,
        env=cf_env,
    )
    if args.url:
        info(f"deployment complete; verify {args.url.rstrip('/')}/api/health")
    else:
        info("deployment complete; run `pnpm exec wrangler deployments list` for the URL")


def menu() -> str:
    print("Shafile deployment")
    print("  1) Local container (Docker/Podman; WSL on Windows)")
    print("  2) Container + Cloudflare Tunnel")
    print("  3) Cloudflare Workers (D1 + R2)")
    choice = input("Choose [1]: ").strip() or "1"
    return {"1": "container", "2": "tunnel", "3": "cloudflare"}.get(choice, "container")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Deploy Shafile to a container runtime or Cloudflare Workers."
    )
    parser.add_argument(
        "--target",
        choices=("container", "tunnel", "cloudflare"),
        help="deployment target; prompts when omitted",
    )
    parser.add_argument(
        "--backend",
        default="auto",
        choices=("auto", "wslc", "docker", "podman", "nerdctl"),
        help="container backend (Windows defaults to wslc)",
    )
    parser.add_argument(
        "--action",
        default="up",
        choices=("up", "down", "logs", "status"),
        help="container action",
    )
    parser.add_argument("--follow", action="store_true", help="follow container logs")
    parser.add_argument("--skip-install", action="store_true", help="skip pnpm install")
    parser.add_argument("--url", help="deployment URL to print a health-check hint")
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="fail instead of prompting for missing values",
    )
    parser.add_argument("--dry-run", action="store_true", help="print commands only")
    args = parser.parse_args()

    global DRY_RUN
    DRY_RUN = args.dry_run
    if args.dry_run:
        warn("dry-run is for command preview; compose and pnpm calls are not executed")
    try:
        target = args.target or menu()
        if target in ("container", "tunnel"):
            deploy_container(args)
        elif target == "cloudflare":
            deploy_cloudflare(args)
        else:
            die(f"unknown target: {target}")
    except DeployError as error:
        die(str(error))


if __name__ == "__main__":
    main()
