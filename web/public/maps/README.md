# Self-hosted boundary maps

Each `<id>.json` is a GeoJSON `FeatureCollection` the map visual can colour by a measure; `index.json` lists them (`id`, a label, which feature property holds the region's name, the properties a data value may match). Nothing here calls an outside map service.

To add a map: drop a GeoJSON file here, add it to `index.json`, and pick it in the visual's options. Region names in the data are matched to the feature's name property after normalising case, accents and prefixes such as "Tỉnh" / "Thành phố"; the visual's "aliases" option maps what the data calls a region to what the map calls it, one `data name = map name` per line.

## vietnam-provinces

The 34 provinces and municipalities of Vietnam after Decree 19/2025 (effective 1 July 2025). Properties: `name` (Vietnamese), `nameEn`, `code`.

Derived from the GeoJSON export of [thanglequoc/vietnamese-provinces-database](https://github.com/thanglequoc/vietnamese-provinces-database) (MIT License, © 2021 Thang Le Quoc), whose boundaries come from the Vietnam Administrative Units Reference Map published by the Vietnam Natural Resources, Environment and Cartography Publishing House. The 34 province features were merged into one collection and simplified (Douglas–Peucker, 0.0015°) for the web; the file carries no warranty.
