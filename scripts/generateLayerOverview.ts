import ScriptUtils from "./ScriptUtils";
import {existsSync, mkdirSync, writeFileSync} from "fs";
import * as licenses from "../assets/generated/license_info.json"
import {LayoutConfigJson} from "../Models/ThemeConfig/Json/LayoutConfigJson";
import {LayerConfigJson} from "../Models/ThemeConfig/Json/LayerConfigJson";
import Constants from "../Models/Constants";
import {
    DesugaringContext,
    PrepareLayer, PrepareTheme,
    ValidateLayer,
    ValidateThemeAndLayers
} from "../Models/ThemeConfig/LegacyJsonConvert";
import {Translation} from "../UI/i18n/Translation";
import {TagRenderingConfigJson} from "../Models/ThemeConfig/Json/TagRenderingConfigJson";
import * as questions from "../assets/tagRenderings/questions.json";
import * as icons from "../assets/tagRenderings/icons.json";

// This scripts scans 'assets/layers/*.json' for layer definition files and 'assets/themes/*.json' for theme definition files.
// It spits out an overview of those to be used to load them

interface LayersAndThemes {
    themes: LayoutConfigJson[],
    layers: { parsed: LayerConfigJson, path: string }[]
}


class LayerOverviewUtils {

    loadThemesAndLayers(): LayersAndThemes {

        const layerFiles = ScriptUtils.getLayerFiles();

        const themeFiles: LayoutConfigJson[] = ScriptUtils.getThemeFiles().map(x => x.parsed);

        console.log("Discovered", layerFiles.length, "layers and", themeFiles.length, "themes\n")
        if (layerFiles.length + themeFiles.length === 0) {
            throw "Panic: no themes and layers loaded!"
        }
        return {
            layers: layerFiles,
            themes: themeFiles
        }
    }

    writeSmallOverview(themes: { id: string, title: any, shortDescription: any, icon: string, hideFromOverview: boolean }[]) {
        const perId = new Map<string, any>();
        for (const theme of themes) {
            const data = {
                id: theme.id,
                title: theme.title,
                shortDescription: theme.shortDescription,
                icon: theme.icon,
                hideFromOverview: theme.hideFromOverview
            }
            perId.set(theme.id, data);
        }


        const sorted = Constants.themeOrder.map(id => {
            if (!perId.has(id)) {
                throw "Ordered theme id " + id + " not found"
            }
            return perId.get(id);
        });


        perId.forEach((value) => {
            if (Constants.themeOrder.indexOf(value.id) >= 0) {
                return; // actually a continue
            }
            sorted.push(value)
        })

        writeFileSync("./assets/generated/theme_overview.json", JSON.stringify(sorted, null, "  "), "UTF8");
    }

    writeTheme(theme: LayoutConfigJson) {
        if (!existsSync("./assets/generated/themes")) {
            mkdirSync("./assets/generated/themes");
        }
        writeFileSync(`./assets/generated/themes/${theme.id}.json`, JSON.stringify(theme, null, "  "), "UTF8");
    }

    writeLayer(layer: LayerConfigJson) {
        if (!existsSync("./assets/generated/layers")) {
            mkdirSync("./assets/generated/layers");
        }
        writeFileSync(`./assets/generated/layers/${layer.id}.json`, JSON.stringify(layer, null, "  "), "UTF8");
    }

    getSharedTagRenderings(): Map<string, TagRenderingConfigJson> {
        const dict = new Map<string, TagRenderingConfigJson>();

        for (const key in questions["default"]) {
            questions[key].id = key;
            dict.set(key, <TagRenderingConfigJson>questions[key])
        }
        for (const key in icons["default"]) {
            if(typeof icons[key] !== "object"){
                continue
            }
            icons[key].id = key;
            dict.set(key, <TagRenderingConfigJson>icons[key])
        }

        dict.forEach((value, key) => {
            value.id = value.id ?? key;
        })

        return dict;
    }


    private buildLayerIndex(knownImagePaths: Set<string>): Map<string, LayerConfigJson> {
        // First, we expand and validate all builtin layers. These are written to assets/generated/layers
        // At the same time, an index of available layers is built.
        console.log("   ---------- VALIDATING BUILTIN LAYERS ---------")

        const sharedTagRenderings = this.getSharedTagRenderings();
        const layerFiles = ScriptUtils.getLayerFiles();
        const sharedLayers = new Map<string, LayerConfigJson>()
        const prepLayer = new PrepareLayer();
        const state: DesugaringContext = {
            tagRenderings: sharedTagRenderings,
            sharedLayers
        }
        for (const sharedLayerJson of layerFiles) {
            const context = "While building builtin layer " + sharedLayerJson.path
            const fixed = prepLayer.convertStrict(state, sharedLayerJson.parsed, context)
            const validator = new ValidateLayer(knownImagePaths, sharedLayerJson.path, true);
            validator.convertStrict(state, fixed, context)

            if (sharedLayers.has(fixed.id)) {
                throw "There are multiple layers with the id " + fixed.id
            }

            sharedLayers.set(fixed.id, fixed)

            this.writeLayer(fixed)

        }
        return sharedLayers;
    }


    private buildThemeIndex(knownImagePaths: Set<string>, sharedLayers: Map<string, LayerConfigJson>): Map<string, LayoutConfigJson> {
        console.log("   ---------- VALIDATING BUILTIN THEMES ---------")
        const themeFiles = ScriptUtils.getThemeFiles();
        const fixed = new Map<string, LayoutConfigJson>();

        const convertState: DesugaringContext = {
            sharedLayers,
            tagRenderings: this.getSharedTagRenderings()
        }
        for (const themeInfo of themeFiles) {
            let themeFile = themeInfo.parsed
            const themePath = themeInfo.path
            
            themeFile = new PrepareTheme().convertStrict(convertState, themeFile, themePath)

            new ValidateThemeAndLayers(knownImagePaths, themePath, true)
                .convertStrict(convertState, themeFile, themePath)

            this.writeTheme(themeFile)
            fixed.set(themeFile.id, themeFile)
        }

        this.writeSmallOverview(themeFiles.map(tf => {
            const t = tf.parsed;
            return {
                ...t,
                hideFromOverview: t.hideFromOverview ?? false,
                shortDescription: t.shortDescription ?? new Translation(t.description).FirstSentence().translations
            }
        }));
        return fixed;

    }

    main(_: string[]) {

        const licensePaths = new Set<string>()
        for (const i in licenses) {
            licensePaths.add(licenses[i].path)
        }

        const sharedLayers = this.buildLayerIndex(licensePaths);
        const sharedThemes = this.buildThemeIndex(licensePaths, sharedLayers)

        writeFileSync("./assets/generated/known_layers_and_themes.json", JSON.stringify({
            "layers": Array.from(sharedLayers.values()),
            "themes": Array.from(sharedThemes.values())
        }))
    }
}

new LayerOverviewUtils().main(process.argv)
