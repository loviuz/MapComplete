import {Or, TagsFilter} from "./TagsFilter";
import {UIEventSource} from "../UI/UIEventSource";
import {FilteredLayer} from "./FilteredLayer";
import {Bounds} from "./Bounds";
import {Overpass} from "./Osm/Overpass";
import {Basemap} from "./Leaflet/Basemap";

export class LayerUpdater {
    private _map: Basemap;
    private _layers: FilteredLayer[];

    public readonly runningQuery: UIEventSource<boolean> = new UIEventSource<boolean>(false);
    
    /**
     * The previous bounds for which the query has been run
     */
    private previousBounds: Bounds;

    private _overpass: Overpass;
    private _minzoom: number;

    /**
     * The most important layer should go first, as that one gets first pick for the questions
     * @param map
     * @param minzoom
     * @param layers
     */
    constructor(map: Basemap,
                minzoom: number,
                layers: FilteredLayer[]) {
        this._map = map;
        this._layers = layers;
        this._minzoom = minzoom;
        var filters: TagsFilter[] = [];
        for (const layer of layers) {
            filters.push(layer.filters);
        }
        this._overpass = new Overpass(new Or(filters));

        const self = this;
        map.Location.addCallback(function () {
            self.update();
        });
        self.update();

    }

    private handleData(geojson: any) {
        const self = this;
        function renderLayers(layers: FilteredLayer[]) {
            if (layers.length === 0) {
                self.runningQuery.setData(false);

                if (geojson.features.length > 0) {
                    console.log("Got some leftovers: ", geojson)
                }
                return;
            }
            window.setTimeout(() => {

                const layer = layers[0];
                const rest = layers.slice(1, layers.length);
                geojson = layer.SetApplicableData(geojson);
                renderLayers(rest);
            }, 50)
        }

        renderLayers(this._layers);

    }

    private _failCount = 0;
    private handleFail(reason: any) {
        console.log("QUERY FAILED (retrying in 5 sec)", reason);
        this.previousBounds = undefined;
        const self = this;
        this._failCount++;
        window?.setTimeout(
            function(){self.update()}, this._failCount * 5000
        )
    }


    private update(): void {
        if (this.IsInBounds()) {
            return;
        }
        console.log("Zoom level: ",this._map.map.getZoom(), "Least needed zoom:", this._minzoom)
        if (this._map.map.getZoom() < this._minzoom || this._map.Location.data.zoom < this._minzoom) {
            return;
        }

        if (this.runningQuery.data) {
            console.log("Still running a query, skip");
        }
        
        const bounds = this._map.map.getBounds();

        const diff =0.07;

        const n = bounds.getNorth() + diff;
        const e = bounds.getEast() +  diff;
        const s = bounds.getSouth() - diff;
        const w = bounds.getWest() -  diff;

        this.previousBounds = {north: n, east: e, south: s, west: w};
        
        this.runningQuery.setData(true);
        const self = this;
        this._overpass.queryGeoJson(this.previousBounds,
            function (data) {
                self.handleData(data)
            },
            function (reason) {
                self.handleFail(reason)
            }
        );

    }

   

    private IsInBounds(): boolean {

        if (this.previousBounds === undefined) {
            return false;
        }


        const b = this._map.map.getBounds();
        if (b.getSouth() < this.previousBounds.south) {
            return false;
        }

        if (b.getNorth() > this.previousBounds.north) {
            return false;
        }

        if (b.getEast() > this.previousBounds.east) {
            return false;
        }
        if (b.getWest() < this.previousBounds.west) {
            return false;
        }

        return true;
    }

}