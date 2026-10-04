# Track surveys

Centre lines and track widths from the [TUMFTM racetrack-database](https://github.com/TUMFTM/racetrack-database)
(Technical University of Munich, Institute of Automotive Technology), copied unchanged and licensed under the
GNU Lesser General Public License v3.0; see `LICENSE` in this folder.

Columns: `x_m, y_m, w_tr_right_m, w_tr_left_m` — centre line in metres and track width to the right and left of it.
The centre lines come from OpenStreetMap and the widths from satellite images, so quality varies by circuit and some
layouts have changed since the survey. `scripts/export_positions.py` fits a survey to each race's recorded racing
line and uses it only when the fit passes its checks.
