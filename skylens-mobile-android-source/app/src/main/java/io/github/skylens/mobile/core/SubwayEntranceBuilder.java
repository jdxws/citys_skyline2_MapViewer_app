package io.github.skylens.mobile.core;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Builds a station-to-subway-entrance table from Carto GeoJSON. */
public final class SubwayEntranceBuilder {
    public static final String OUTPUT_FILE = "Subway_Station_Entrances.json";
    public static final int FORMAT_VERSION = 2;

    private static final double EARTH_RADIUS_METERS = 6_371_000d;
    private static final double STATION_GROUP_DISTANCE_METERS = 120d;

    private SubwayEntranceBuilder() { }

    /** Generates the derived file when it does not exist. Safe to call for prepared snapshots. */
    public static void ensureGenerated(File snapshot) throws IOException {
        File output = new File(snapshot, "GeoJSON/" + OUTPUT_FILE);
        if (output.isFile() && output.length() > 0) {
            try {
                if (readObjectJson(output).optInt("formatVersion", 0) >= FORMAT_VERSION) return;
            } catch (Exception error) {
                System.err.println("Subway entrance table upgrade check failed: " + error.getMessage());
            }
        }

        File buildings = new File(snapshot, "GeoJSON/Building_Boundary.json");
        File pois = new File(snapshot, "GeoJSON/POI_Location.json");
        if (!buildings.isFile() || !pois.isFile()) {
            throw new IOException("生成地铁出入口表缺少 Building_Boundary.json 或 POI_Location.json");
        }

        try {
            JSONObject result = build(readJson(buildings), readJson(pois));
            if (!output.getParentFile().isDirectory() && !output.getParentFile().mkdirs()) {
                throw new IOException("无法创建 GeoJSON 目录");
            }
            try (OutputStreamWriter writer = new OutputStreamWriter(
                    new FileOutputStream(output), StandardCharsets.UTF_8)) {
                writer.write(result.toString(2));
                writer.write('\n');
            }
        } catch (Exception error) {
            // A malformed optional export should not make an otherwise usable map unimportable.
            if (output.exists() && !output.delete()) output.deleteOnExit();
            System.err.println("Subway entrance table generation failed: " + error.getMessage());
        }
    }

    static JSONObject build(JSONObject buildings, JSONObject pois) throws Exception {
        List<Stop> stops = collectStops(pois);
        List<Station> stations = groupStations(stops);
        List<Entrance> entrances = collectAndAssignEntrances(buildings, stations);

        Collator collator = Collator.getInstance(Locale.CHINA);
        stations.sort((left, right) -> {
            int byName = collator.compare(left.name, right.name);
            return byName != 0 ? byName : left.id.compareTo(right.id);
        });

        JSONArray stationArray = new JSONArray();
        for (Station station : stations) {
            station.entrances.sort(Comparator.comparingDouble(value -> value.distanceToPlatformMeters));
            JSONArray entranceArray = new JSONArray();
            for (Entrance entrance : station.entrances) entranceArray.put(entrance.json);

            JSONArray coordinates = new JSONArray();
            coordinates.put(station.coordinates[0]);
            coordinates.put(station.coordinates[1]);

            JSONArray stopIds = new JSONArray();
            station.stops.stream().map(stop -> stop.sourceFeatureId).sorted().forEach(stopIds::put);

            JSONObject json = new JSONObject();
            json.put("id", station.id);
            json.put("name", station.name);
            json.put("coordinates", coordinates);
            json.put("district", station.district);
            json.put("street", station.street);
            json.put("number", station.number);
            json.put("platformStopFeatureIds", stopIds);
            json.put("entranceCount", station.entrances.size());
            json.put("entrances", entranceArray);
            stationArray.put(json);
        }

        JSONObject grouping = new JSONObject();
        grouping.put("method", "same-name stops within 120 meters");
        grouping.put("stopCategory", "StopSubway");
        grouping.put("entranceAssetPattern", "SubwayStationEntrance; matching station building fallback");

        JSONArray generatedFrom = new JSONArray();
        generatedFrom.put("Building_Boundary.json");
        generatedFrom.put("POI_Location.json");

        JSONObject result = new JSONObject();
        result.put("formatVersion", FORMAT_VERSION);
        result.put("generatedFrom", generatedFrom);
        result.put("stationGrouping", grouping);
        result.put("stations", stationArray);
        return result;
    }

    private static JSONObject readJson(File file) throws Exception {
        JSONObject result = readObjectJson(file);
        if (!"FeatureCollection".equals(result.optString("type"))) {
            throw new IOException(file.getName() + " 不是 FeatureCollection");
        }
        return result;
    }

    private static JSONObject readObjectJson(File file) throws Exception {
        String contents = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
        if (!contents.isEmpty() && contents.charAt(0) == '\uFEFF') contents = contents.substring(1);
        JSONTokener tokener = new JSONTokener(contents);
        return new JSONObject(tokener);
    }

    private static List<Stop> collectStops(JSONObject pois) {
        List<Stop> result = new ArrayList<>();
        JSONArray features = pois.optJSONArray("features");
        if (features == null) return result;
        for (int index = 0; index < features.length(); index++) {
            JSONObject feature = features.optJSONObject(index);
            if (feature == null) continue;
            JSONObject properties = feature.optJSONObject("properties");
            JSONObject geometry = feature.optJSONObject("geometry");
            if (!includes(properties, "Category", "StopSubway") ||
                    geometry == null || !"Point".equals(geometry.optString("type"))) continue;
            JSONArray coordinates = geometry.optJSONArray("coordinates");
            if (coordinates == null || coordinates.length() < 2) continue;
            result.add(new Stop(
                    index,
                    text(properties, "Name"),
                    text(properties, "Address_District"),
                    text(properties, "Address_Street"),
                    properties == null ? 0 : properties.optInt("Address_Number", 0),
                    new double[]{coordinates.optDouble(0), coordinates.optDouble(1)}
            ));
        }
        return result;
    }

    private static List<Station> groupStations(List<Stop> stops) {
        List<Station> stations = new ArrayList<>();
        for (Stop stop : stops) {
            Station station = null;
            for (Station candidate : stations) {
                if (!candidate.name.equals(stop.name)) continue;
                for (Stop member : candidate.stops) {
                    if (distanceMeters(member.coordinates, stop.coordinates) <= STATION_GROUP_DISTANCE_METERS) {
                        station = candidate;
                        break;
                    }
                }
                if (station != null) break;
            }
            if (station == null) {
                station = new Station(
                        "subway-station-" + (stations.size() + 1),
                        stop.name.isEmpty() ? "Unnamed subway station " + (stations.size() + 1) : stop.name
                );
                stations.add(station);
            }
            station.stops.add(stop);
        }

        for (Station station : stations) {
            double longitude = 0, latitude = 0;
            for (Stop stop : station.stops) {
                longitude += stop.coordinates[0];
                latitude += stop.coordinates[1];
                if (station.district.isEmpty() && !stop.district.isEmpty()) station.district = stop.district;
                if (station.street.isEmpty() && !stop.street.isEmpty()) station.street = stop.street;
                if (station.number == 0 && stop.number != 0) station.number = stop.number;
            }
            station.coordinates[0] = longitude / station.stops.size();
            station.coordinates[1] = latitude / station.stops.size();
        }
        return stations;
    }

    private static List<Entrance> collectAndAssignEntrances(
            JSONObject buildings, List<Station> stations) throws Exception {
        List<Entrance> result = new ArrayList<>();
        JSONArray features = buildings.optJSONArray("features");
        if (features == null || stations.isEmpty()) return result;

        for (int index = 0; index < features.length(); index++) {
            JSONObject feature = features.optJSONObject(index);
            if (feature == null) continue;
            JSONObject properties = feature.optJSONObject("properties");
            JSONObject geometry = feature.optJSONObject("geometry");
            if (properties == null || geometry == null) continue;
            String asset = text(properties, "Asset");
            String geometryType = geometry.optString("type");
            if (!asset.toLowerCase(Locale.ROOT).contains("subwaystationentrance") ||
                    (!"Polygon".equals(geometryType) && !"MultiPolygon".equals(geometryType))) continue;

            double[] point = centroid(geometry);
            if (point == null) continue;
            Station nearestStation = null;
            double nearestDistance = Double.POSITIVE_INFINITY;
            for (Station station : stations) {
                for (Stop stop : station.stops) {
                    double distance = distanceMeters(point, stop.coordinates);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestStation = station;
                    }
                }
            }
            if (nearestStation == null) continue;

            addEntrance(properties, geometry, index, point, nearestStation, nearestDistance,
                    "subway-station-entrance", result);
        }

        // Some stations have no separate entrance geometry; their ground-level
        // station building is the entrance. Match by station name and address.
        for (int index = 0; index < features.length(); index++) {
            JSONObject feature = features.optJSONObject(index);
            if (feature == null) continue;
            JSONObject properties = feature.optJSONObject("properties");
            JSONObject geometry = feature.optJSONObject("geometry");
            if (properties == null || geometry == null) continue;
            String geometryType = geometry.optString("type");
            if (!"Polygon".equals(geometryType) && !"MultiPolygon".equals(geometryType)) continue;

            double[] point = centroid(geometry);
            if (point == null) continue;
            String name = text(properties, "Name");
            String street = text(properties, "Address_Street");
            int number = properties.optInt("Address_Number", 0);
            List<Station> namedCandidates = new ArrayList<>();
            for (Station station : stations) {
                if (name.isEmpty() || !station.name.equals(name)) continue;
                if (!street.isEmpty() && !station.street.isEmpty() && !station.street.equals(street)) continue;
                if (number != 0 && station.number != 0 && station.number != number) continue;
                namedCandidates.add(station);
            }
            if (namedCandidates.isEmpty()) continue;

            Station nearestStation = null;
            double nearestDistance = Double.POSITIVE_INFINITY;
            for (Station station : namedCandidates) {
                for (Stop stop : station.stops) {
                    double distance = distanceMeters(point, stop.coordinates);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestStation = station;
                    }
                }
            }
            if (nearestStation == null || !nearestStation.entrances.isEmpty()) continue;
            addEntrance(properties, geometry, index, point, nearestStation, nearestDistance,
                    "station-building-fallback", result);
        }
        return result;
    }

    private static void addEntrance(
            JSONObject properties, JSONObject geometry, int sourceFeatureId, double[] point,
            Station station, double distanceMeters, String entranceType,
            List<Entrance> result) throws Exception {
        JSONArray coordinates = new JSONArray();
        coordinates.put(point[0]);
        coordinates.put(point[1]);
        double roundedDistance = Math.round(distanceMeters * 100d) / 100d;
        JSONObject json = new JSONObject();
        json.put("id", "subway-entrance-" + (result.size() + 1));
        json.put("sourceFeatureId", sourceFeatureId);
        json.put("name", text(properties, "Name").isEmpty()
                ? "Subway station entrance" : text(properties, "Name"));
        json.put("asset", text(properties, "Asset"));
        json.put("coordinates", coordinates);
        json.put("geometry", geometry);
        json.put("district", text(properties, "Address_District"));
        json.put("street", text(properties, "Address_Street"));
        json.put("number", properties.optInt("Address_Number", 0));
        json.put("stationId", station.id);
        json.put("stationName", station.name);
        json.put("distanceToPlatformMeters", roundedDistance);
        json.put("entranceType", entranceType);

        Entrance entrance = new Entrance(roundedDistance, json);
        station.entrances.add(entrance);
        result.add(entrance);
    }

    private static double[] centroid(JSONObject geometry) {
        try {
            JSONArray coordinates = geometry.getJSONArray("coordinates");
            JSONArray polygons = "MultiPolygon".equals(geometry.optString("type"))
                    ? coordinates : new JSONArray().put(coordinates);
            double longitude = 0, latitude = 0;
            int count = 0;
            for (int polygonIndex = 0; polygonIndex < polygons.length(); polygonIndex++) {
                JSONArray polygon = polygons.getJSONArray(polygonIndex);
                if (polygon.length() == 0) continue;
                JSONArray ring = polygon.getJSONArray(0);
                int size = ring.length();
                if (size > 1) {
                    JSONArray first = ring.getJSONArray(0);
                    JSONArray last = ring.getJSONArray(size - 1);
                    if (Double.compare(first.getDouble(0), last.getDouble(0)) == 0 &&
                            Double.compare(first.getDouble(1), last.getDouble(1)) == 0) size--;
                }
                for (int pointIndex = 0; pointIndex < size; pointIndex++) {
                    JSONArray point = ring.getJSONArray(pointIndex);
                    longitude += point.getDouble(0);
                    latitude += point.getDouble(1);
                    count++;
                }
            }
            return count == 0 ? null : new double[]{longitude / count, latitude / count};
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean includes(JSONObject properties, String key, String expected) {
        if (properties == null) return false;
        for (String value : properties.optString(key, "").split(",")) {
            if (value.trim().equals(expected)) return true;
        }
        return false;
    }

    private static String text(JSONObject object, String key) {
        if (object == null) return "";
        Object value = object.opt(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static double distanceMeters(double[] left, double[] right) {
        double latitudeDelta = Math.toRadians(right[1] - left[1]);
        double longitudeDelta = Math.toRadians(right[0] - left[0]);
        double latitude1 = Math.toRadians(left[1]);
        double latitude2 = Math.toRadians(right[1]);
        double a = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
                Math.cos(latitude1) * Math.cos(latitude2) *
                        Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
        return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
    }

    private static final class Stop {
        final int sourceFeatureId;
        final String name, district, street;
        final int number;
        final double[] coordinates;

        Stop(int sourceFeatureId, String name, String district, String street,
             int number, double[] coordinates) {
            this.sourceFeatureId = sourceFeatureId;
            this.name = name;
            this.district = district;
            this.street = street;
            this.number = number;
            this.coordinates = coordinates;
        }
    }

    private static final class Station {
        final String id, name;
        final List<Stop> stops = new ArrayList<>();
        final List<Entrance> entrances = new ArrayList<>();
        final double[] coordinates = new double[2];
        String district = "", street = "";
        int number;

        Station(String id, String name) {
            this.id = id;
            this.name = name;
        }
    }

    private static final class Entrance {
        final double distanceToPlatformMeters;
        final JSONObject json;

        Entrance(double distanceToPlatformMeters, JSONObject json) {
            this.distanceToPlatformMeters = distanceToPlatformMeters;
            this.json = json;
        }
    }
}
