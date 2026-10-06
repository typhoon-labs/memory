"""One connection attempt from inside a pod, reported as one line of JSON.

Sent into a workload's pod by lib.sh (`in_pod`), which has only the standard
library to count on. A bearer token, when the attempt needs one, is read from
standard input.

    pod_probe.py connect HOST PORT          open a TCP connection, send nothing
    pod_probe.py post URL JSON-BODY [bearer]  POST the body; `bearer` sends the token

Output: {"connected": bool, "status": int or null, "body": text, "error": text}
"""

import json
import socket
import sys
import urllib.error
import urllib.request

TIMEOUT = 4


def connect(host: str, port: str) -> dict:
    try:
        socket.create_connection((host, int(port)), timeout=TIMEOUT).close()
        return {"connected": True, "status": None, "body": "", "error": ""}
    except OSError as error:
        return {"connected": False, "status": None, "body": "", "error": f"{type(error).__name__}: {error}"}


def post(url: str, body: str, bearer: bool, timeout: float) -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if bearer:
        headers["Authorization"] = "Bearer " + sys.stdin.read().strip()
    request = urllib.request.Request(url, data=body.encode(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return {"connected": True, "status": response.status, "body": response.read().decode()[:4000], "error": ""}
    except urllib.error.HTTPError as error:
        return {"connected": True, "status": error.code, "body": error.read().decode()[:4000], "error": ""}
    except OSError as error:
        reason = getattr(error, "reason", error)
        return {"connected": False, "status": None, "body": "", "error": f"{type(reason).__name__}: {reason}"}


def main() -> None:
    mode = sys.argv[1]
    if mode == "connect":
        answer = connect(sys.argv[2], sys.argv[3])
    elif mode == "post":
        bearer = "bearer" in sys.argv[4:]
        # A governed call may take a model's time; an attempt around the
        # gateway is given up after TIMEOUT seconds.
        answer = post(sys.argv[2], sys.argv[3], bearer, 60 if "patient" in sys.argv[4:] else TIMEOUT)
    else:
        raise SystemExit(f"unknown mode {mode!r}")
    print(json.dumps(answer))


main()
