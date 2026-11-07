package io.github.skylens.mobile.core;

/** 地图库里的一张地图。数量字段为 -1 表示未知。 */
public final class MapEntry {
    public final String id;
    public final String name;
    public final String source;
    public final long importedAtMillis;
    public final long bytes;
    public final int buildings;
    public final int roads;
    public final int pois;
    public final int routes;

    public MapEntry(String id, String name, String source, long importedAtMillis, long bytes,
                    int buildings, int roads, int pois, int routes) {
        this.id = id;
        this.name = name;
        this.source = source;
        this.importedAtMillis = importedAtMillis;
        this.bytes = bytes;
        this.buildings = buildings;
        this.roads = roads;
        this.pois = pois;
        this.routes = routes;
    }

    public MapEntry withName(String newName) {
        return new MapEntry(id, newName, source, importedAtMillis, bytes, buildings, roads, pois, routes);
    }
}
