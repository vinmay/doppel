"""Doppel's label vocabulary: kinds of things, reject classes and visual attributes.

Writes data/vocab.json. Every row is embedded once by the in-browser model
(web/vocab-build.html) and shipped as web/public/vocab-<hash>.bin.

- kind "thing":   what a photo can be. Its top match is "Doppel sees: <label>".
- kind "reject":  not allowed (screens, rooms, documents, people) -> "Take it outside."
- kind "unclear": a photo the model can't read (dark, blurry) -> treated as uncertain.
- kind "attr":    visual attributes for "What they share".

Usage: python tools/doppel_vocab.py
"""
import json
import re
from datetime import date
from pathlib import Path

THINGS = """
tree; tree bark; tree trunk; tree stump; tree roots; branch; twig; log; leaf; pile of leaves; pine needles; pinecone;
acorn; seed pod; moss; lichen; grass; clover; weeds; dandelion; flower; rose; tulip; sunflower; daisy; mushroom; fern;
bush; hedge; cactus; succulent plant; ivy; vine; rock; pebbles; gravel; boulder; sand; soil; mud; puddle; pond; lake;
river; waterfall; ocean waves; beach; snow; ice; icicle; cloud; sky; sunset; mountain; hill; field; feather; bird;
pigeon; duck; squirrel; dog; cat; butterfly; bee; spider web; snail shell; seashell; bird nest; eggshell; zebra;
elephant skin; tiger; giraffe; leopard spots; snake skin; fish scales; turtle shell; caterpillar;
donut; bagel; broccoli; cauliflower; artichoke; chocolate bar; waffle; pancake; cookie; cracker; loaf of bread;
pretzel; cotton candy; cotton; pumpkin; orange; lemon; apple; strawberry; pineapple; corn on the cob; melon; cabbage;
lettuce; onion; pomegranate; popcorn; honeycomb; coffee beans; rice; noodles; pizza; cheese; marshmallow; egg;
ice cream cone; brain coral; sponge;
brick wall; stone wall; concrete; asphalt road; sidewalk; crack in the pavement; manhole cover; drain grate; fence;
chain-link fence; wooden fence; gate; hexagonal tiles; paving stones; cobblestones; roof tiles; window; door;
staircase; railing; bench; picnic table; trash can; mailbox; fire hydrant; stop sign; traffic cone; traffic light;
street lamp; utility pole; power lines; street sign; bicycle; car; truck; bus; tire; wheel; motorcycle; parking lot;
garage door; striped awning; umbrella; flag; playground slide; swing; basketball hoop; ball; tennis ball;
soccer ball; rope; chain; garden hose; bucket; flower pot; statue; fountain; bridge; building; house; shed; barn;
graffiti; mural; poster; rusty metal; peeling paint; corrugated metal; air conditioner unit; solar panel; pipe;
crosswalk stripes; shadow; reflection; knitted wool; wicker basket; straw; hay bale; cork; cardboard box;
plastic bag; bottle; soda can; glove; shoe; hat; doormat; tarp; scarecrow; birdhouse; pumpkin patch
"""

REJECTS = """
phone screen; computer screen; television; laptop; indoor room; living room; bedroom; kitchen; office;
bathroom; document; page of text; book; receipt; person; face; selfie; group of people; hand
"""

UNCLEAR = """
dark blurry photo; black image; out of focus photo; overexposed white photo
"""

ATTRS = """
round; striped; spotted; rough; smooth; fluffy; ridged; shiny; dark; white; bright; green; red; brown; yellow;
orange; blue; gray; pink; black; bumpy; wrinkled; scaly; hexagonal; grid-like; square; pointed; spiky; furry;
cracked; curved; wavy; full of holes; grainy; layered; woven; puffy; speckled; checkered; metallic; wooden; leafy;
ring-shaped; cone-shaped; soft
"""

MASS = {"moss", "lichen", "grass", "clover", "weeds", "ivy", "gravel", "sand", "soil", "mud", "snow", "ice", "sky",
        "pebbles", "pine needles", "coffee beans", "rice", "noodles", "popcorn", "cheese", "concrete", "cotton",
        "cotton candy", "lettuce", "cabbage", "broccoli", "cauliflower", "straw", "graffiti", "cork", "rusty metal",
        "peeling paint", "corrugated metal", "elephant skin", "snake skin", "fish scales", "leopard spots",
        "knitted wool", "power lines", "roof tiles", "paving stones", "cobblestones", "hexagonal tiles",
        "crosswalk stripes", "ocean waves", "tree roots", "pine needles", "tree bark", "honeycomb", "soda can"}


def split(block: str) -> list[str]:
    return [s.strip() for s in re.split(r"[;\n]", block) if s.strip()]


def article(label: str) -> str:
    if label in MASS and label != "soda can":
        return label
    if label.endswith("s") and label not in {"bus", "cactus", "hibiscus", "glass"}:
        return label  # plural: "pebbles", "weeds"
    return ("an " if label[0] in "aeiou" else "a ") + label


def main():
    items = []
    seen = set()
    for kind, block in (("thing", THINGS), ("reject", REJECTS), ("unclear", UNCLEAR)):
        for label in split(block):
            if label in seen:
                raise SystemExit(f"duplicate label: {label}")
            seen.add(label)
            text = f"a photo of {article(label)}" if kind != "unclear" else f"a {label}"
            items.append({"text": text, "label": label, "kind": kind})
    attrs = split(ATTRS)
    if len(set(attrs)) != len(attrs):
        raise SystemExit("duplicate attr")
    for a in attrs:
        items.append({"text": f"something {a}", "label": a, "kind": "attr"})
    out = {
        "model": "litert-community/embeddinggemma-2-text-vision-440m-litert-lm (browser, query prefix)",
        "date": date.today().isoformat(),
        "count": len(items),
        "counts": {k: sum(1 for i in items if i["kind"] == k) for k in ("thing", "reject", "unclear", "attr")},
        "items": items,
    }
    path = Path(__file__).resolve().parent.parent / "data" / "vocab.json"
    path.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path}: {out['counts']}")


if __name__ == "__main__":
    main()
