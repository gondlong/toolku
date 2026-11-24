"""Konversi dokumen via LibreOffice headless (dipakai app.py & server_api.py)."""
import os
import shutil
import subprocess
import uuid

SOFFICE = shutil.which("soffice") or shutil.which("libreoffice")
SOFFICE_PROFILE = "/tmp/toolku-lo-profile"


def run_soffice(src, outdir, fmt="pdf", timeout=90):
    """Convert a document via LibreOffice headless. Returns output file path.

    F4: the per-run profile dir is removed in `finally`, so even a timeout
    or crash cannot leak /tmp/toolku-lo-profile-* directories.
    """
    if not SOFFICE:
        raise RuntimeError("LibreOffice tidak terpasang di server ini.")
    profile = f"{SOFFICE_PROFILE}-{uuid.uuid4().hex[:8]}"
    cmd = [
        SOFFICE, "--headless", "--norestore", "--invisible",
        f"-env:UserInstallation=file://{profile}",
        "--convert-to", fmt, "--outdir", outdir, src,
    ]
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=timeout)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    base = os.path.splitext(os.path.basename(src))[0]
    out = os.path.join(outdir, base + "." + fmt.split(":")[0])
    if not os.path.exists(out):
        raise RuntimeError((p.stderr or p.stdout or b"").decode("utf-8", "ignore")[:400] or "Konversi gagal.")
    return out
