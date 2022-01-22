import Combine from "../Base/Combine";
import {UIEventSource} from "../../Logic/UIEventSource";
import UserRelatedState from "../../Logic/State/UserRelatedState";
import Translations from "../i18n/Translations";
import {Utils} from "../../Utils";
import {FlowStep} from "./FlowStep";
import Title from "../Base/Title";
import BaseUIElement from "../BaseUIElement";
import Histogram from "../BigComponents/Histogram";
import Toggleable from "../Base/Toggleable";
import List from "../Base/List";
import CheckBoxes from "../Input/Checkboxes";

/**
 * Shows the data to import on a map, asks for the correct layer to be selected
 */
export class PreviewPanel extends Combine implements FlowStep<{ features: { properties: any, geometry: { coordinates: [number, number] } }[] }>{
    public readonly IsValid: UIEventSource<boolean>;
    public readonly Value: UIEventSource< { features: { properties: any, geometry: { coordinates: [number, number] } }[] }>
    
    constructor(
        state: UserRelatedState,
        geojson: { features: { properties: any, geometry: { coordinates: [number, number] } }[] }) {
        const t = Translations.t.importHelper;
        console.log("Datapanel received", geojson)


        const propertyKeys = new Set<string>()
        for (const f of geojson.features) {
            Object.keys(f.properties).forEach(key => propertyKeys.add(key))
        }
        
        const attributeOverview : BaseUIElement[] = []

        const n = geojson.features.length;
        for (const key of Array.from(propertyKeys)) {
            
            const values = Utils.NoNull(geojson.features.map(f => f.properties[key]))
            const allSame = !values.some(v => v !== values[0])
            if(allSame){
                attributeOverview.push(new Title(key+"="+values[0]))
                if(values.length === n){
                attributeOverview.push(t.allAttributesSame)
                }else{
                    attributeOverview.push(t.someHaveSame.Subs({count: values.length, percentage: Math.floor(100 * values.length / n)}))
                }
                continue
            }

            const uniqueCount = new Set(values).size
            if(uniqueCount !== values.length){
                attributeOverview.push()
                // There are some overlapping values: histogram time!
                let hist : BaseUIElement = new Histogram(
                    new UIEventSource<string[]>(values),
                    "Value",
                    "Occurence",
                    {
                        sortMode: "count-rev"
                    }
                    
                )
                
                const title = new Title(key+"=*")
                if(uniqueCount > 15){
                    hist = new Toggleable(title, 
                        hist.SetClass("block")
                    ).Collapse()
                    
                }else{
                    attributeOverview.push(title)
                }
                
                attributeOverview.push(hist)
                continue
            }
        
            // All values are different, we add a boring (but collapsable) list
            attributeOverview.push(new Toggleable(
                new Title(key+"=*"),
                    new List(values)
            ) )

        }
        
        const confirm = new CheckBoxes([t.inspectLooksCorrect])
        
        super([
            new Title(t.inspectDataTitle.Subs({count:geojson.features.length })),
            ...attributeOverview,
            confirm
        ]);

        this.Value = new UIEventSource<{features: {properties: any; geometry: {coordinates: [number, number]}}[]}>(geojson)
        this.IsValid = confirm.GetValue().map(selected => selected.length == 1)
        
    }
}