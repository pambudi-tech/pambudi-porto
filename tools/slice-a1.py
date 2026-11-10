"""Slices the print's A1 plates (tools/build-card-3d.py writes them) with
Bambu Studio, ready to print: each a .gcode.3mf for the Bambu Lab A1 (0.4 mm
nozzle), Bambu PLA Basic, 0.08 mm layers (0.08mm Extra Fine), no supports,
the textured PEI plate; one colour each (cards white, seals red), printed in
turn. Open one in Bambu Studio and print, or put it on the A1's microSD card.

Run (Bambu Studio installed in /Applications), after the build:
    python3 tools/slice-a1.py [--variant=twist]

Writes public/downloads/3dprint/<plate>.gcode.3mf, the page's downloads,
puts each plate's print time in its label (public/assets/print/card-3d*.json),
and prints each plate's time and filament as Bambu Studio works them out.

Bambu Studio's command line doesn't follow its presets' "inherits", so each
preset is flattened here (its parents' settings under its own) first, and
passed as the system preset it is (so the file names Bambu's own presets).
"""
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = Path('/Applications/BambuStudio.app')
STUDIO = APP / 'Contents' / 'MacOS' / 'BambuStudio'
PROFILES = APP / 'Contents' / 'Resources' / 'profiles' / 'BBL'
DOWNLOADS = ROOT / 'public' / 'downloads' / '3dprint'

ARGS = sys.argv[1:]
VARIANT = next((a.split('=', 1)[1] for a in ARGS if a.startswith('--variant=')), 'twist')
SUFFIX = '' if VARIANT == 'removable' else f'-{VARIANT}'
OUT = ROOT.parent / 'output' / f'card-3d-print{SUFFIX}'

MACHINE = 'Bambu Lab A1 0.4 nozzle'
PROCESS = '0.08mm Extra Fine @BBL A1'
FILAMENT = 'Bambu PLA Basic @BBL A1'
BED = 'Textured PEI Plate'          # the plate the A1 comes with
# Each plate, its filament's colour (shown in Bambu Studio and on the printer).
PLATES = {
    'a1-cards': '#F2F1EC',          # white
    'a1-keyrings': '#F2F1EC',
    'a1-seals': '#9E1B24',          # red
    'fit-test': '#F2F1EC',          # one colour: it only tries the fit
}


def presets():
    """Every preset in Bambu Studio's BBL profiles, by name."""
    found = {}
    for path in PROFILES.rglob('*.json'):
        try:
            data = json.loads(path.read_text())
        except (ValueError, UnicodeDecodeError):
            continue
        if isinstance(data, dict) and 'name' in data:
            found.setdefault(data['name'], data)
    return found


def flattened(name, every):
    """A preset with its parents' settings under its own."""
    data = every[name]
    parent = data.get('inherits')
    merged = flattened(parent, every) if parent else {}
    merged.update({k: v for k, v in data.items() if k != 'inherits'})
    return merged


def summary(sliced):
    """Print time and filament, from the sliced file's own record."""
    with zipfile.ZipFile(sliced) as z:
        info = z.read('Metadata/slice_info.config').decode()
    get = lambda key: (re.search(rf'key="{key}" value="([^"]*)"', info) or [None, '?'])[1]
    seconds = int(float(get('prediction')))
    hours, minutes = seconds // 3600, seconds % 3600 // 60
    return dict(time=f'{hours} h {minutes:02d} min' if hours else f'{minutes} min', grams=get('weight'),
                bytes=sliced.stat().st_size)


def main():
    every = presets()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        machine = flattened(MACHINE, every)
        process = flattened(PROCESS, every)
        process['curr_bed_type'] = BED
        for key, data in (('machine', machine), ('process', process)):
            data['from'] = 'system'
            (tmp / f'{key}.json').write_text(json.dumps(data, indent=1))
        results = {}
        for plate, colour in PLATES.items():
            source = OUT / f'{plate}{SUFFIX}.3mf'
            filament = flattened(FILAMENT, every)
            filament.update({'from': 'system', 'filament_colour': [colour], 'default_filament_colour': [colour]})
            (tmp / 'filament.json').write_text(json.dumps(filament, indent=1))
            out = tmp / plate
            out.mkdir()
            name = f'{plate}{SUFFIX}.gcode.3mf'
            run = subprocess.run([str(STUDIO), '--load-settings', f'{tmp / "machine.json"};{tmp / "process.json"}',
                                  '--load-filaments', str(tmp / 'filament.json'), '--arrange', '0', '--orient', '0',
                                  '--slice', '0', '--export-3mf', name, '--outputdir', str(out), str(source)],
                                 capture_output=True, text=True)
            result = json.loads((out / 'result.json').read_text())
            if result.get('return_code') != 0 or not (out / name).exists():
                errors = sorted({line.split('] ', 2)[-1] for line in run.stdout.splitlines() if '[error]' in line})
                sys.exit(f'{plate}: {result.get("error_string")}\n' + '\n'.join(errors[:8]))
            DOWNLOADS.mkdir(parents=True, exist_ok=True)
            (DOWNLOADS / name).write_bytes((out / name).read_bytes())
            results[plate] = summary(DOWNLOADS / name)
            print(f'{name}: {results[plate]["time"]}, {results[plate]["grams"]} g, '
                  f'{results[plate]["bytes"] / 1e6:.1f} MB', flush=True)
        (OUT / 'sliced.json').write_text(json.dumps(results, indent=2))
    # The page's download labels carry each plate's print time.
    for path in (ROOT / 'public' / 'assets' / 'print').glob(f'card-3d{SUFFIX}*.json'):
        data = json.loads(path.read_text())
        for item in data['downloads']:
            plate = Path(item['href']).name.replace(f'{SUFFIX}.gcode.3mf', '')
            if plate in results:
                item['label'] = f"{item['label'].split(' · ')[0]} · {results[plate]['time']}"
        path.write_text(json.dumps(data, indent=2) + '\n')


main()
