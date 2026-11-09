"""Apply only the allowlisted staging Auth configuration."""
from pathlib import Path
import subprocess
import tempfile

REF = "yhchfxjzxhinreklnxbi"
source = Path(__file__).resolve().parents[2] / "supabase/staging/config.toml"
with tempfile.TemporaryDirectory(prefix="ironz-staging-config-") as directory:
    destination = Path(directory) / "supabase"
    destination.mkdir()
    (destination / "config.toml").write_text(source.read_text())
    result = subprocess.run(["supabase", "config", "push", "--project-ref", REF, "--workdir", directory, "--yes"], capture_output=True, text=True)
    if result.returncode:
        print("Staging Auth configuration failed:", (result.stderr or result.stdout)[-1200:])
        raise SystemExit(result.returncode)
    print("Staging Auth configured: private preview origin, public signup disabled, synthetic admin-created users only.")
