// Give each Flare popup model its own fresh document/origin, using the same immutable publication.
export function timeManifest(source) {
    if(!Array.isArray(source.Variants)||!source.Variants.length)throw new Error('missing variants');
    const variants=source.Variants.flatMap(v=>v.Library==='Flare'?['Dial','Dropdown','List'].map(model=>({
        ...v,Name:v.Name+'-'+model,SourceVariant:v.Name,TimeModel:model
    })):[v]);
    if(new Set(variants.map(v=>v.Name)).size!==variants.length)throw new Error('duplicate time variant');
    return {...source,Variants:variants,TimeProtocol:'independent-popup-model-documents'};
}
