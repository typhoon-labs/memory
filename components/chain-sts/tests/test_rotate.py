"""`python -m chain_sts.rotate`: a new key, a key's kid, and the steps with their waits."""

from __future__ import annotations

import os
import subprocess
import sys

from conftest import COMPONENT, rsa_key, write_pem

from chain_sts import rotate
from chain_sts.keys import FileSigner


def test_new_key_is_one_the_service_reads(capsys, tmp_path):
    assert rotate.main(["new-key"]) == 0
    out, err = capsys.readouterr()
    assert out.startswith("-----BEGIN PRIVATE KEY-----\n")
    path = tmp_path / "key.pem"
    path.write_text(out)
    signer = FileSigner.from_pem_file(path)
    assert signer.public_key.key_size == 2048
    # Its kid on standard error, the PEM alone on standard output.
    assert err == f"kid {signer.kid}\n"


def test_new_key_is_never_written_to_a_terminal(capsys, monkeypatch):
    monkeypatch.setattr(sys.stdout, "isatty", lambda: True)
    assert rotate.main(["new-key"]) == 2
    out, err = capsys.readouterr()
    assert out == ""
    assert "not writing a private key to a terminal" in err


def test_kid_of_files(capsys, tmp_path):
    paths = [write_pem(rsa_key(), tmp_path / f"{n}.pem") for n in ("a", "b")]
    assert rotate.main(["kid", *map(str, paths)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines == [f"{FileSigner.from_pem_file(p).kid}  {p}" for p in paths]


def test_kid_of_something_that_is_not_a_key(capsys, tmp_path):
    path = tmp_path / "key.pem"
    path.write_text("not a key")
    assert rotate.main(["kid", str(path)]) == 2
    assert "not an unencrypted PEM private key" in capsys.readouterr().err


def test_kid_from_a_pipe(tmp_path):
    path = write_pem(rsa_key(), tmp_path / "key.pem")
    result = subprocess.run(
        [sys.executable, "-m", "chain_sts.rotate", "kid", "/dev/stdin"],
        input=path.read_bytes(),
        capture_output=True,
        env=os.environ | {"PYTHONPATH": str(COMPONENT / "src")},
        timeout=15,
        check=True,
    )
    assert result.stdout.decode() == f"{FileSigner.from_pem_file(path).kid}  /dev/stdin\n"


def test_waits():
    # After the next key is published: the gateway's refresh and a margin.
    # After it signs: the token's lifetime, the verifiers' leeway and a margin.
    assert rotate.waits(token_ttl=300, jwks_refresh=300, leeway=60) == (360, 420)
    assert rotate.waits(token_ttl=600, jwks_refresh=900, leeway=30) == (960, 690)


def test_steps(capsys):
    assert rotate.main(["steps"]) == 0
    text = capsys.readouterr().out
    assert "Wait at least 6 min (360 s) after that rollout" in text
    assert "Wait at least 7 min (420 s) after that rollout" in text
    assert "signingKey.next: <new>" in text
    assert rotate.main(["steps", "--token-ttl", "120", "--jwks-refresh", "600"]) == 0
    text = capsys.readouterr().out
    assert "11 min (660 s)" in text
    assert "4 min (240 s)" in text
