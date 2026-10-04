from pathlib import Path
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "deliverables"
OUT.mkdir(exist_ok=True)
doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
sec.top_margin = sec.bottom_margin = Inches(.7)
sec.left_margin = sec.right_margin = Inches(.75)
sec.header_distance = sec.footer_distance = Inches(.3)
styles = doc.styles
for name in ["Normal", "Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3", "List Bullet", "List Number"]:
    st = styles[name]
    st.font.name = "Arial"
    st.font.color.rgb = RGBColor(0, 0, 0)
    st.font.size = Pt(10.5)
    st.paragraph_format.space_after = Pt(6)
    st.paragraph_format.line_spacing = 1.12
styles["Title"].font.size = Pt(25)
styles["Title"].font.bold = True
styles["Title"].paragraph_format.space_after = Pt(10)
styles["Subtitle"].font.size = Pt(12)
styles["Heading 1"].font.size = Pt(17)
styles["Heading 1"].font.bold = True
styles["Heading 1"].paragraph_format.page_break_before = False
styles["Heading 1"].paragraph_format.space_before = Pt(18)
styles["Heading 1"].paragraph_format.space_after = Pt(12)
styles["Heading 2"].font.size = Pt(12)
styles["Heading 2"].font.bold = True
styles["Heading 2"].paragraph_format.space_before = Pt(12)
styles["Heading 2"].paragraph_format.space_after = Pt(6)
for name in ["Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3"]:
    styles[name].paragraph_format.keep_with_next = True
    pr = styles[name].element.find(qn("w:pPr"))
    if pr is not None:
        for child in list(pr):
            if child.tag == qn("w:pBdr"): pr.remove(child)

def rich(p, text):
    pattern = r"(\*\*.*?\*\*|\[[^\]]+\]\(https?://[^)]+\))"
    for part in re.split(pattern, text):
        if not part: continue
        if part.startswith("**"):
            p.add_run(part[2:-2]).bold = True
        elif part.startswith("[") and "](" in part:
            label, url = part[1:].split("](", 1)
            url = url[:-1]
            h = OxmlElement("w:hyperlink")
            h.set(qn("r:id"), p.part.relate_to(url, RT.HYPERLINK, is_external=True))
            r = OxmlElement("w:r")
            props = OxmlElement("w:rPr")
            c = OxmlElement("w:color"); c.set(qn("w:val"), "175A72"); props.append(c)
            u = OxmlElement("w:u"); u.set(qn("w:val"), "single"); props.append(u)
            r.append(props); t = OxmlElement("w:t"); t.text = label; r.append(t); h.append(r); p._p.append(h)
        else: p.add_run(part)
    return p

def p(text, style=None):
    return rich(doc.add_paragraph(style=style), text)

def h(text, level=1):
    para = doc.add_heading(text, level)
    if text == "1 Product commitment":
        para.paragraph_format.page_break_before = True
    return para

def bullets(items):
    for item in items: p(item, "List Bullet")

def table(headers, rows, widths):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for i,w in enumerate(widths):
        t.columns[i].width = Inches(w)
        t.rows[0].cells[i].width = Inches(w)
    for i,title in enumerate(headers): rich(t.rows[0].cells[i].paragraphs[0], title)
    for row in rows:
        cells = t.add_row().cells
        for i,val in enumerate(row):
            cells[i].width = Inches(widths[i])
            rich(cells[i].paragraphs[0], str(val))
    for ri,row in enumerate(t.rows):
        row.height = None
        trpr = row._tr.get_or_add_trPr()
        ns = OxmlElement("w:cantSplit"); trpr.append(ns)
        if ri == 0:
            repeat = OxmlElement("w:tblHeader"); trpr.append(repeat)
        for ci,cell in enumerate(row.cells):
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tcpr = cell._tc.get_or_add_tcPr()
            shade = OxmlElement("w:shd")
            shade.set(qn("w:fill"), "213C4B" if ri == 0 else ("F2F6F7" if ri % 2 == 0 else "FFFFFF"))
            tcpr.append(shade)
            margin = OxmlElement("w:tcMar")
            for edge in ["top", "left", "bottom", "right"]:
                el = OxmlElement("w:"+edge); el.set(qn("w:w"), "95"); el.set(qn("w:type"), "dxa"); margin.append(el)
            tcpr.append(margin)
            borders = OxmlElement("w:tcBorders")
            for edge in ["top","left","bottom","right"]:
                el=OxmlElement("w:"+edge); el.set(qn("w:val"),"single"); el.set(qn("w:sz"),"4"); el.set(qn("w:color"),"D9D9D9"); borders.append(el)
            tcpr.append(borders)
            for para in cell.paragraphs:
                para.paragraph_format.space_after = Pt(2)
                para.paragraph_format.line_spacing = 1.06
                para.paragraph_format.keep_with_next = (ri == 0)
                if ci == 0 and widths[0] < .8: para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in para.runs:
                    run.font.size = Pt(9.5)
                    if ri == 0:
                        run.bold = True; run.font.color.rgb = RGBColor(255,255,255)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t

header = sec.header.paragraphs[0]
header.text = "LEARNING GAME STUDIO   |   PRODUCT AND DELIVERY PLAN"
header.runs[0].font.size = Pt(8)
header.runs[0].font.color.rgb = RGBColor(0,0,0)
footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run("Planning baseline 3 October 2026  •  ").font.size = Pt(8)
fld = OxmlElement("w:fldSimple"); fld.set(qn("w:instr"), "PAGE"); footer._p.append(fld)
doc.core_properties.title = "Learning Game Studio Product and Delivery Plan"
doc.core_properties.subject = "Complete commercial release specification and implementation roadmap"
doc.core_properties.author = "Product planning"

p("Learning Game Studio Product and Delivery Plan", "Title")
p("Complete commercial release specification", "Subtitle")
p("Planning baseline 3 October 2026")
p("Build a general-purpose studio that turns a user's own learning materials into a coherent, engaging game. Creators can play it, inspect and improve it, export it, and share an editable notebook. Recipients can play without AI, resume their progress, use the same creation workflow, and compete asynchronously with invited players.")
p("This plan defines the complete commercial product and the milestones required to achieve it. The product is not yet implemented in this workspace. Architecture choices, pricing and delivery estimates below are recommendations; external integration limits are supported by linked documentation.")
p("**The central design decision:** invest in excellent reusable mechanics, visual systems, assessment contracts and a campaign director. Use AI selectively to interpret source material and author constrained content. Compile the approved result into a deterministic local game.")
h("How to use this plan", 2)
p("Sections 1–3 define the product promise and experience. Sections 4–7 specify the learning system, all 50 scaffolds, visuals and compiler. Sections 8–10 cover implementation, portability and multiplayer. Sections 11–14 define commercial operation, delivery, acceptance criteria and unresolved decisions.")
h("The complete user journey", 2)
p("Bring materials → inspect what was extracted → choose audience and outcome → preview a proposed game → refine it → play and save → export → recipient plays or remixes → invited players synchronize challenges.")
h("What commercial completion means", 2)
p("A customer can purchase any paid offering, receive it immediately, and finish the advertised workflow without developer help. All promised game recipes, supported imports, exports, recovery paths, billing and support must work. Internal prototypes and pilots establish evidence; they do not reduce the final release commitment.")

h("1 Product commitment")
p("The product supplies the authoring system and reusable game design. Users supply the subject matter. Certification preparation, technical learning, school topics, professional procedures, language material and other domains are test cases for the same product.")
table(["ID","Requirement","Commitment"], [
("R01","User supplied learning content","Accept mixed source collections and preserve their evidence. Do not hard-code a single curriculum."),
("R02","NotebookLM source coverage","Support its documented content categories through direct, connected or assisted imports. State access limits precisely."),
("R03","Audio and video","Drag/drop MP3 and MP4; transcribe speech, inspect subtitles and preserve useful visual evidence."),
("R04","Game quality","Produce coherent campaigns with meaningful actions, consequences, prepared guidance and polished presentation."),
("R05","Fifty scaffolds","Ship 25 general recipes and five additional recipes for each of five child/teen bands."),
("R06","Low AI cost","Use deterministic systems, reuse approved content and regenerate only affected objects. Show authoring cost before use."),
("R07","Provider choice","Support API keys and qualified local models; add subscription integrations only through permitted official routes."),
("R08","Relevant visuals and music","Reuse source figures, render factual visuals and bundle reusable art plus ten redistributable tracks."),
("R09","AI free gameplay","All required game content, assessment rules, hints and assets are prepared before export."),
("R10","Portable editable exports","Recipients can Play, View sources, Create/Remix and export again. Full exports preserve available source material."),
("R11","Saved state everywhere","Persist creator work, learner checkpoints, revision history and pending multiplayer updates."),
("R12","Asynchronous multiplayer","Every recipe integrates shared missions, progress and suitable results. Tor is supported through the launcher."),
("R13","Simple excellent interface","Guided creation, playable previews, direct editing, accessible controls and recoverable errors."),
("R14","Commercial completeness","Ship supported installers, updates, purchase flows, documentation, licenses, operational ownership and support.")
], [.55,1.7,4.75])
p("The five proposed age bands are 3–5, 6–8, 9–11, 12–14 and 15–17. Adults use the general catalog. The bands are product defaults, not a scientific claim that people fall into five fixed learning types. Reading, prior knowledge, language and access needs refine the defaults. Children under three would need a separate caregiver-led offering.")
p("Broad input support does not imply that every source supports every game mechanic. Simulations require validated rules; open-ended judgments require an appropriate rubric or human review. The studio should explain these boundaries while still offering useful supported activities.")

h("2 Product experience")
p("The primary navigation is Library, Studio and Play. Share remains available from the notebook. Advanced controls appear when relevant, while the first creation flow asks for only materials, intended outcome, audience/readiness and experience preference.")
table(["Screen","Primary action","Required experience"], [
("Library","Continue or Create","Resume the last game or draft; open an export; try a bundled example without an account."),
("Materials","Add and inspect","Drop files, paste text/links or connect an authorized source. Display processing progress per source."),
("Source review","Resolve gaps","Preview pages, figures and timestamped transcripts. Correct, exclude or replace incomplete material."),
("Learning brief","Set direction","Propose objectives from evidence; allow creator edits. Ask reading/readiness and session preference."),
("Game proposal","Choose a campaign","Show a mission map, coverage, two or three eligible alternatives, playable sample and cost estimate."),
("Studio","Edit the game","Live scene in the center, mission outline left, contextual properties right and expandable evidence below."),
("Player","Do the next mission","Clear purpose, responsive controls, contextual help, prepared feedback and useful stopping points."),
("Progress","Understand achievement","Distinguish supported practice, independent success, later retention and unfamiliar application."),
("Competition","Invite and compare","Private invitation, shared challenge rules, mission standings and accurate synchronization status."),
("Share","Export or remix","Choose recipient delivery, check included material and verify the package before saving.")
], [1.15,1.2,4.65])
h("Creation interaction details", 2)
p("The default Create action prepares a learning proposal and representative mission. It should not silently commit to the most expensive processing path. The creator can accept the proposal, change eligible mechanics, adjust scope, or edit the objective directly before compiling the full game.")
p("The Studio supports direct edits to prompts, accepted responses, hint sequences, source references, labels, mission order and feedback. Preview from here, Show evidence, Replace mechanic and Regenerate this section are first-class actions. Undo/redo and version comparisons make experimentation safe.")
p("On a phone, each task uses a single main surface with contextual sheets. Complex campaign graphs also have an equivalent ordered-list editor. Heavy processing can run in a paired desktop launcher or explicitly selected hosted service; the interface preserves the draft and explains the current job.")
h("Recipient interaction details", 2)
p("Opening a notebook presents Play, Create a copy and View sources. The recipient receives the same core creation workflow. Existing material can be edited and compiled locally. New automatic semantic authoring uses the recipient's supported provider or a suitable local model. A provider failure never prevents playing an already compiled game.")
p("A remix records its parent revision and retained attribution. Sharing a game starts recipients with independent learner profiles. Transferring personal progress is a separate, explicit action.")

h("3 Interface and experience quality")
p("Use an original visual identity with clear typography, strong spatial hierarchy and consistent interaction behavior. The creator should feel like a polished creative application, while the player can adopt an age-appropriate theme. Professional, adventure and calm presentations share the same learning content.")
bullets([
"Make one primary next action visible on each screen. Preserve the learner's place when opening evidence, settings or help.",
"Use a coherent spacing and typography system, restrained chrome, legible source previews, and transitions that explain changes.",
"Give every interactive object distinct focus, hover, pressed, selected, disabled and success/error states.",
"Keep animation responsive and purposeful. Prefer motion that explains cause and effect; retain a reduced-motion alternative.",
"Use persistent independent music and effects controls. Captions and text alternatives cover meaningful audio.",
"Show real progress for long jobs: completed stages, remaining work when estimable, cancellation and resumable checkpoints.",
"Use plain recovery instructions for missing access, damaged imports, low storage, disconnected peers and incompatible versions."
])
p("Target WCAG 2.2 AA for the application interface and design accessible interactions for each game recipe. Provide keyboard controls, visible focus, adequate contrast, captions, alternatives to dragging and adjustable timing. A canvas scene needs semantic companion controls. An alternative assessment must still exercise the intended capability. [W3C accessibility reference](https://www.w3.org/WAI/WCAG22/quickref/)")
h("Design production process", 2)
p("Create a component library and interaction specification before expanding the screen count. Build realistic prototypes of import repair, visual editing, gameplay feedback and export. Test these with first-time creators and learners, then carry the approved components into the application.")
p("Each scaffold receives an art and interaction brief: framing, controls, feedback timing, responsive layout, sound cues, accessible alternative and recovery behavior. Record expected behavior in short reference videos so implementation reviews can assess the same quality standard.")
h("Proposed usability gates", 2)
p("These are targets to validate, not measured results. In representative first-use sessions, target at least 90% unassisted completion of create–preview–export and recipient play–resume–remix. Investigate every failure that loses work, conceals missing evidence or makes a learner unsure what to do next.")
p("Test all advertised device classes with real content. Set final load, memory and frame-time budgets after the first engine benchmark. Target responsive interaction under 100 ms for ordinary local actions and smooth 60 fps animation on the declared baseline where the scene calls for continuous motion. Loading a large video notebook receives a separate budget from opening a small text notebook.")

h("4 Source support and integration reliability")
p("Support every documented NotebookLM content category through an explicit import route. Current Google documentation includes documents, presentations, spreadsheets, text, PDFs, images, audio, EPUB, webpages, public captioned YouTube videos and service-specific sources such as eligible Play Books and Gemini chats. Google currently labels this help center Gemini Notebook. [Google source documentation](https://support.google.com/gemininotebook/answer/16215270?hl=en)")
table(["Source category","Implementation","Quality and recovery requirement"], [
("PDF DOCX PPTX TXT MD","Direct upload and drag/drop; parse structure and preserve originals.","Inspect reading order, figures and tables; offer OCR and correction for scans."),
("CSV and spreadsheets","Parse cells and headers; authorized Sheets export/connector.","Preserve units and display values; do not infer formulas or causal meaning from a grid."),
("EPUB and pasted text","Direct ingestion of accessible unencrypted content.","Retain chapter structure and source locations; preserve Unicode."),
("Images","Decode verified formats; OCR and optional visual interpretation.","Keep original image and regions; distinguish extracted labels from inferred meaning."),
("MP3 and audio","Inspect/decode streams and transcribe with timestamps.","Expose transcript corrections, language selection and failed segments."),
("MP4 and video","Extract speech, subtitles and selected frames; retain timestamps.","Visual demonstrations need visual evidence; speech alone is not complete extraction."),
("Web and linked files","Retrieve accessible content with a capture preview.","Show what was captured; use paste/upload fallback for protected or inaccessible pages."),
("Google Docs Slides Sheets","Authorized connector or user export.","Preserve access boundaries, source identity and a revision snapshot."),
("YouTube","Authorized caption download or supplied SRT/VTT/transcript/media.","Never promise automatic transcript access to every public video."),
("NotebookLM links","Recognize the link and guide source/artifact acquisition.","List what was obtained, missing or linked only. Retain provenance."),
("Play Books and Gemini chats","Authorized accessible export or pasted content where available.","Support the category without promising an unavailable third-party extraction path.")
], [1.35,2.3,3.35])
p("YouTube's official caption download API requires permission to edit the video. The dependable product paths are owner-authorized captions, uploaded caption files, assisted transcript paste, and user-provided original media. Caption availability in YouTube's interface is not a universal third-party download API. [YouTube caption documentation](https://developers.google.com/youtube/v3/docs/captions/download)")
h("NotebookLM generated material", 2)
p("Import officially downloaded audio/video as prepared learning assets; import flashcard CSV, slide PDF/PPTX and infographic images where available. Reports and notes can arrive through authorized Docs/Sheets exports or uploaded files. Treat generated artifacts as secondary materials and preserve original evidence where possible. A notebook share URL alone is not a verified complete export API. [Audio exports](https://support.google.com/gemininotebook/answer/16212820?hl=en), [Flashcard exports](https://support.google.com/gemininotebook/answer/16958963?hl=en-GB), [Slide exports](https://support.google.com/gemininotebook/answer/16757456?hl=en-CA)")
p("Maintain source states: Ready, Partly extracted, Needs review, Waiting for access, Failed and Linked only. Record extracted pages or time ranges. The creator sees a coverage report before compilation and can resolve gaps rather than receiving a silently shortened game.")
p("Publish a tested format and codec matrix with file-size and device limits. Support categories broadly, then verify each advertised extension using fixtures. Keep desktop processing available for larger media. Do not equate a filename extension with a decodable stream or an accurate transcript.")

h("5 Learning design and campaign composition")
p("Use four learning processes: Understand, Guided Practice, Remember and Apply. Exam preparation combines recall and application under suitable conditions. Adventure, Calm, Challenge, Cooperative and Competitive are experience settings, not diagnoses of fixed learning styles.")
table(["Learning process","Mechanic design","Evidence recorded"], [
("Understand","Explore an annotated model, compare examples, predict and explain.","Recognized distinctions and explanations, with support recorded."),
("Guided Practice","Observe a worked example, complete missing steps, then solve.","Step errors, assistance, distinct successful attempts."),
("Remember","Retrieve before revealing help; revisit across sessions.","Recall, hints, delay and success on a changed instance."),
("Apply","Diagnose, repair, construct or decide in a new case.","Independent use of the target capability in an unfamiliar situation.")
], [1.2,3.05,2.75])
p("IES recommends spacing, worked examples with problem solving, combining graphics with explanation, retrieval and explanatory questioning, with differing evidence strengths. These principles guide the recipes; they do not establish that every generated game works. [IES practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1)")
p("The campaign director assembles a small compatible set of mechanics into a coherent purpose. A mission moves through curiosity, demonstration or exploration, supported action, independent challenge and a satisfying consequence. Later missions revisit knowledge and ask learners to use it in a different setting.")
p("Knowledge should unlock useful capabilities. Understanding a process enables a repair; a distinction reveals a clue; evidence supports a consequential choice. Preserve what the learner builds as a useful artifact, such as a model, explanation or investigation record.")
p("Original game research associates autonomy, competence and relatedness with enjoyment and future play. Research on the mathematics game Zombie Division supports testing close integration of learning and mechanics. Neither source validates the whole proposed catalog. [Motivation study](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf), [Integrated game study](https://shura.shu.ac.uk/3556/)")
h("Adaptation without runtime AI", 2)
p("Use transparent evidence states: introduced, solved with support, solved independently, retained after a delay and applied in a new situation. Prepared rules choose prerequisite review, worked examples, faded help or harder variants. The learner can choose between suitable next missions.")
p("Separate recall scheduling from procedural competence and transfer. Avoid an uncalibrated universal mastery percentage. Store attempts, hint use, error categories and distinct variants. Parameterized challenges must have validated solution rules; novelty alone does not make them educational.")
h("Assessment boundaries", 2)
p("Use deterministic scoring for bounded responses, validated procedures, structured evidence tasks and supported simulations. Open essays, creative designs, interpersonal judgments, pronunciation and physical performance need appropriate specialized tools, human review or self-assessment. A rubric can support reflection without pretending to provide an objective automated score.")

h("6 The complete scaffold catalog")
p("Ship 50 meaningful recipes on approximately ten reusable interaction engines. Every recipe must include eligibility rules, an observable learning action, prepared hints, explanations, visual treatment, controls, accessible alternatives, saved state and multiplayer result support. A catalog label alone does not count as a completed scaffold.")
h("Twenty five general recipes", 2)
general = [
("01","Concept map repair","Repair relationships using explicit concepts and evidence."),
("02","Classification workshop","Sort examples by a supported rule and explain difficult cases."),
("03","Comparison puzzle","Identify meaningful similarities and differences."),
("04","Analogy construction","Complete structured correspondences with reviewed limits."),
("05","Definition building","Assemble a precise definition and reject near misses."),
("06","Process reconstruction","Restore a documented sequence and dependencies."),
("07","Missing step completion","Finish a partially worked procedure with fading help."),
("08","Fault diagnosis","Infer a fault from documented symptoms and evidence."),
("09","Repair challenge","Apply approved actions to restore a modeled system."),
("10","Constrained action planning","Choose a valid plan that satisfies stated requirements."),
("11","Evidence investigation","Connect observations to supported conclusions."),
("12","Claim verification","Evaluate a claim against cited source material."),
("13","Argument construction","Arrange claims and evidence with an explicit rubric."),
("14","Competing explanations","Compare hypotheses using discriminating evidence."),
("15","Timeline investigation","Reconstruct chronology and supported relationships."),
("16","Branching decisions","Make consequential choices under authored rules."),
("17","Role missions","Complete tasks through a defined professional or story role."),
("18","Resource allocation","Apply knowledge while balancing explicit constraints."),
("19","Prediction and experiment","Predict and inspect validated outcomes."),
("20","Build to specification","Construct a solution and test explicit requirements."),
("21","Diagram reconstruction","Assemble labels, parts and supported connections."),
("22","Chart and data investigation","Read, compare and reason with verified data."),
("23","Media checkpoints","Interpret timestamped audio/video evidence."),
("24","Recall escape mission","Retrieve and combine knowledge to resolve a mission."),
("25","Structured teach back","Explain with prepared components and review criteria.")
]
table(["ID","Recipe","Essential learning action"], general, [.5,2.05,4.45])
h("Twenty five age adapted recipes", 2)
p("Five bands provide defaults for language, independence, pacing and interface complexity. They are flexible design groupings. Younger children need adult-supported setup and age-appropriate interaction. Individual development and learning context remain important. [NAEYC principles](https://www.naeyc.org/resources/position-statements/dap/principles)")
kids=[
("26","3–5","Discovery scenes","Explore pictures and identify supported features."),
("27","3–5","Puppet stories","Choose actions and retell events with a caregiver."),
("28","3–5","Pretend play stations","Use concepts in a familiar shop, kitchen or workshop."),
("29","3–5","Pattern parade","Rebuild and extend supported patterns."),
("30","3–5","Build and tell","Assemble objects and explain with adult prompts."),
("31","6–8","Word and picture workshop","Combine visual/text tiles into meaningful descriptions."),
("32","6–8","Step train","Reconstruct manageable procedures or story sequences."),
("33","6–8","Changing rule sorter","Classify, then adapt when the stated rule changes."),
("34","6–8","Clue map","Follow evidence and explain the route."),
("35","6–8","Partner helper","Take turns solving and explaining on one device."),
("36","9–11","Evidence detective","Use clues to distinguish explanations."),
("37","9–11","Experiment predictor","Predict a result before inspecting supported observations."),
("38","9–11","Systems repair workshop","Repair a model governed by explicit rules."),
("39","9–11","Plan and budget expedition","Apply concepts while meeting resource constraints."),
("40","9–11","Teach a character","Correct prepared misconceptions through explanation."),
("41","12–14","Hypothesis casebook","Test competing explanations against evidence."),
("42","12–14","Claim and evidence arena","Build and review a supported argument."),
("43","12–14","Constraint design workshop","Design a solution satisfying several requirements."),
("44","12–14","Perspective switching drama","Interpret a situation from documented perspectives."),
("45","12–14","Strategy campaign","Plan several steps, inspect outcomes and revise."),
("46","15–17","Scenario internship","Complete linked decisions in a realistic role."),
("47","15–17","Research dossier","Compare sources and justify a conclusion."),
("48","15–17","Prototype studio","Design, test and revise against explicit constraints."),
("49","15–17","Review studio","Evaluate prepared work with a defensible rubric."),
("50","15–17","Capstone campaign","Combine capabilities across unfamiliar cases.")
]
table(["ID","Age","Recipe","Essential learning action"], kids, [.45,.55,2.0,4.0])
h("Shared implementation engines", 2)
p("Build classification/matching, sequences, relationship graphs, branching state machines, evidence boards, constrained construction, diagrams/charts, media checkpoints, bounded recall and validated simulation engines. Recipes combine these with distinctive progression, art, scaffolding and assessment. Specialized domain modules can extend the contracts after their correctness is demonstrated.")
p("Rules filter incompatible recipes first. AI can rank the eligible candidates using the evidence, audience and objective. Offer the creator a few explained alternatives. A campaign should maintain consistent controls and avoid unnecessary changes of mechanic.")

h("7 Visuals audio and minimal AI authoring")
table(["Asset path","Production method","Export behavior"], [
("World and interface","Reusable professionally designed theme packs, characters, animation and effects.","Bundle licensed assets and the theme configuration."),
("Source visuals","Extract permitted figures, slide images and selected video frames.","Include original provenance and any necessary source assets."),
("Factual learning visuals","Compile structured objects, data and relationships into SVG/canvas/HTML.","Keep labels and specifications editable; bundle final assets."),
("Custom illustrations","Optional AI generation or creator upload during authoring.","Freeze and cache approved images; never regenerate during play."),
("Music and sound","Ten commissioned or verified redistributable tracks plus feedback sounds.","Include license/attribution records, volume settings and local playback.")
], [1.35,3.1,2.55])
p("A diagram can become the playable board. For example, the same network diagram can support explanation, reconstruction and diagnosis. Factual labels, graph axes, equations and values should remain editable text or vector elements. An attractive image is not evidence that a technical or anatomical depiction is correct.")
p("Every asset records its role, source, license, content hash and editable specification where applicable. Complex visual information gets an equivalent description or data representation. Theme changes should not change assessed facts or invalidate learner progress. [W3C complex image guidance](https://www.w3.org/WAI/tutorials/images/complex/)")
h("The authoring pipeline", 2)
p("Acquire → extract → inventory → retrieve evidence → draft learning objects → select eligible recipes → compose campaign → generate needed assets → validate → creator review → package.")
p("Create an inventory of the complete source collection before retrieval. Use exact keyword search for names, formulas and identifiers, local embeddings where useful for paraphrases, and selective reranking for difficult cases. RAG supplies evidence to authoring; it does not establish curriculum quality or prove the answer key.")
p("Each generated object contains source references, a learning objective, accepted response structure, prepared hints, misconceptions and an explanation. AI produces constrained data consumed by our engines. The product does not execute arbitrary generated application code.")
bullets([
"Cache extraction, evidence selections, approved objects and assets by content hash and relevant version.",
"Regenerate only changed objects and their dependencies. Preserve creator approvals elsewhere.",
"Use deterministic layout, validation, scoring, scheduling and packaging.",
"Reuse imported flashcards, explanations and media after review.",
"Estimate token/media costs before authoring; allow a budget cap and cancellation.",
"Route difficult content to a stronger model only when quality evaluation justifies it. Keep a manual repair path."
])
p("Validation has two layers. Structural checks cover schemas, asset references, reachable branches, scoring cases and offline dependencies. Semantic review checks evidence support, ambiguity, misleading alternatives and omitted concepts. JSON validity cannot substitute for factual review.")
h("Provider integration policy", 2)
p("Launch with supported API-key adapters and tested local-model options. Offer a capability matrix for text, vision, transcription, structured output and cost estimation. Store credentials outside shared notebooks and use a desktop credential store or a clearly controlled application service.")
p("Current OpenAI guidance permits the described self-service ChatGPT plan integration for local open-source/personal tools; paid or hosted apps must request access. Current Claude guidance permits users to authenticate through unmodified Claude Code under its terms, but does not permit our app to collect or route Claude.ai subscription credentials. Grok and other subscriptions require their own verified route. [OpenAI integration policy](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt), [Claude authentication policy](https://code.claude.com/docs/en/legal-and-compliance)")
p("The requirement is provider choice wherever officially supported. API keys remain the dependable fallback. Do not make commercial launch depend on access that has not been granted, or imply that a subscription automatically includes every image/audio API.")

h("8 System architecture")
p("Use a shared browser creator/player with an optional desktop launcher. Keep core notebook, compiler and gameplay contracts portable. WASM is an acceleration tool for workloads that benefit from it; the main interface uses browser-native text and controls.")
table(["Module","Recommended approach","Responsibility"], [
("Application shell","TypeScript and React","Library, studio, source reader, accessible controls and settings."),
("Game scenes","Phaser leading candidate","2D rendering, input, animations, sound and scene management."),
("Semantic visuals","SVG HTML canvas","Editable diagrams, labels, equations, charts and accessible alternatives."),
("Background work","Web Workers and selected WASM","Extraction, search, validation and suitable local inference."),
("Desktop launcher","Tauri and Rust leading candidate","Filesystem saves, large media processing, credential storage and Tor sidecars."),
("Browser persistence","IndexedDB plus OPFS adapter","Structured state and large assets; explicit backup/export support."),
("Desktop persistence","SQLite plus asset files","Transactional state, revisions, checkpoints and durable outbox."),
("Optional services","Small authenticated service layer","Paid account/billing, approved hosted processing, encrypted mailbox and backups.")
], [1.35,2.25,3.4])
p("Phaser is designed for 2D browser games with WebGL/Canvas rendering. Tauri supports bundled sidecar executables, which makes packaged media tools and a Tor process feasible. Confirm these choices with a representative performance and packaging experiment before committing every recipe. [Phaser documentation](https://docs.phaser.io/phaser/getting-started/what-is-phaser), [Tauri sidecars](https://v2.tauri.app/develop/sidecar/)")
p("Use a single owner for database writes and storage adapters across browser and desktop. Threaded WASM has deployment requirements that must be tested for each selected module. Do not make it a requirement of the direct-file portable player.")
h("Versioned contracts", 2)
table(["Contract","Required contents"], [
("Source and EvidenceUnit","Stable ID, content hash, origin, extraction version, text/media unit, page/slide/time/region and review status."),
("Objective and AssessmentItem","Observable capability, evidence, proposed prerequisites, response structure, rubric, hints and explanations."),
("ScaffoldManifest and Mission","Eligibility, required data, allowed actions, engine version, seed, completion rule and access alternatives."),
("Campaign and VisualSpec","Mission graph, review encounters, narrative configuration, semantic visual objects and layouts."),
("NotebookRevision and Asset","Parent revision, changed objects, runtime requirements, content hashes, licenses and attribution."),
("PlayerProfile and PlayEvent","Local identity, settings, mission/run, action sequence, assistance, outcome and checkpoint."),
("CompetitionRound and SyncEnvelope","Assessment fingerprint, rules, participants, unique message ID, encrypted payload and acknowledgment.")
], [2.15,4.85])
p("Preserve stable object IDs. A cosmetic change should not erase progress. Material changes to an assessment should identify affected learning evidence and competition compatibility. Store migrations and retain the previous valid revision until the new revision is verified.")
h("Repository boundaries", 2)
p("Separate packages for schemas, source adapters, evidence/retrieval, learning compiler, scaffold registry, game engines, visual rendering, persistence, export, multiplayer and UI. Keep native processes behind narrow interfaces. Use shared fixtures to verify that browser and desktop produce equivalent game behavior.")

h("9 Saving export and remix")
p("Autosave is a core subsystem shared by creator and player. Persist meaningful actions immediately and batch continuous edits briefly. Commit an answer and its progression together. Record partial puzzle arrangement, seed, hint state, media position and review schedule. The interface shows Saved only after a successful commit.")
p("Keep a small action journal with periodic snapshots. Preserve the previous good revision, write assets before committing references, and resume completed processing stages after interruption. Handle multiple tabs with a single writer or explicit revision conflicts. A crash can recover the last confirmed save; no application can promise recovery of a write that never completed.")
p("Browser storage is origin-scoped and may be cleared or evicted. Request persistence where available, monitor capacity and provide notebook/progress backups. The desktop launcher supports durable local files. [Browser storage documentation](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)")
h("Portable notebook format", 2)
p("Define .learnpack as a versioned archive containing a manifest, notebook revision, included sources, extracted evidence, objectives, assessments, campaign, visual specifications, assets, runtime compatibility and licenses. Preserve source locations and remix lineage. Exclude provider credentials, private networking keys and personal progress from ordinary shared exports.")
table(["Delivery","Best use","Persistence and networking"], [
("Editable learnpack","Complete notebook opened in the free web/offline studio.","Autosave in the studio; recipient can use the same create flow."),
("Self-contained HTML","Compact notebooks containing the player, editor and compatible embedded assets.","Offline Create/Remix and explicit Save/Load; browser storage where supported."),
("Offline launcher bundle","Large media and dependable local use on a supported OS.","Filesystem saving, heavy processing and Tor integration."),
("Progress save file","Move a learner's state between supported devices.","Separate from the shared learning notebook.")
], [1.45,2.65,2.9])
p("A single executable is not portable across every operating system. Offer recipient-friendly choices and signed platform-specific launchers. Directly opened HTML also cannot guarantee consistent localStorage behavior across browsers. [MDN local-file storage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)")
p("A full export preserves the original creation capability when the necessary sources are included and permitted. If sources are omitted, describe which operations remain available. Existing compiled content still plays, but complete reconstruction from missing originals cannot be promised.")
p("Every export presented as a complete notebook includes the offline Create/Remix entry point and necessary editor modules. Recipients can add sources through supported imports, create or edit material manually, and export again. If a full editor and media collection exceed practical single-file limits, offer the complete launcher bundle instead. Do not label a play-only preview as a complete editable export.")
p("Manual edits, installed theme changes, supported visual edits, compatible recipe changes and deterministic recompilation require no AI. New automatic interpretation or illustration generation may use the recipient's provider. Include the creator entry point and required editor modules in the offline bundle so remixing does not depend on discovering a live website.")
h("Acceptance scenarios", 2)
bullets([
"Close and reopen during editing, midway through a puzzle and after answering; recover the last confirmed state.",
"Export, import, remix and re-export while network access is disabled; compare content, provenance and assets.",
"Upgrade the application and migrate an old notebook/save; retain a recovery copy.",
"Move notebook and progress to a second device; resume the same challenge and settings.",
"Handle interrupted writes, full storage, missing assets and incompatible versions with a recoverable explanation."
])

h("10 Asynchronous multiplayer and Tor")
p("Every campaign inherits a shared challenge layer. Players have separate local profiles and complete missions at their own pace. Each scaffold reports suitable outcomes to a common mission board, standings and history. No AI or continuous connection is needed during play.")
p("An invitation carries the room ID, assessed-content fingerprint, challenge rules, endpoint and a joining capability. It never includes the host's private identity key. Peers create their own identities, accept the invitation and verify content/rules compatibility before joining.")
p("The desktop launcher connects the local game to a maintained Tor implementation and onion service. Ordinary HTML does not acquire Tor connectivity from an address alone. Experimental browser WASM Tor currently needs an external networking gateway; keep it outside the critical launch path. [Tor service setup](https://community.torproject.org/onion-services/setup/), [Tor implementation status](https://onionservices.torproject.org/dev/implementations/), [Browser experiment](https://github.com/ethereum/tor-js)")
h("Synchronization design", 2)
p("Save results to a durable local outbox before sending. Exchange small authenticated messages with unique IDs, acknowledgments and safe retries. Maintain accepted room events separately from private learning history. Rebuild standings deterministically so duplicate, delayed or reordered messages do not award extra points.")
p("Direct peer delivery needs eventual overlapping online time. Tor is not an offline mailbox. Offer an encrypted persistent mailbox, self-hosted or managed, for participants who never overlap. Keep result-file exchange as a recovery path. Show Saved locally, Waiting to sync and Synced accurately.")
h("Competition rules", 2)
bullets([
"Bind each round to assessed content, engine/scoring versions, mission set, seed and agreed hint/attempt policies.",
"Use an assessment fingerprint rather than a whole-file hash, so theme or music changes preserve compatibility.",
"Prefer accuracy and independently solved challenges. Cap repeated credit and keep practice available.",
"Offer optional speed rounds only where fluency is the objective; keep the main score usable across access needs.",
"Support shared progress and cooperative goals for every recipe. Free-form quality scores need an agreed rubric or structured scored component."
])
p("Signed events establish which participant submitted a result; they cannot prove honest play in an editable offline client. Launch standings are friendly competition. A later verified ranking service would need a separate trust and assessment design.")
h("Network and child experience", 2)
p("Provide private invitations and explicit participant removal. Younger learners use adult-managed networking and minimal profile information. The game should remain useful when a peer disconnects or the mailbox is unavailable. Keep Tor details behind an understandable connection setting while displaying the consequence of peer-only versus mailbox delivery.")

h("11 Commercial product and operations")
p("Recommended packaging preserves the recipient's full local create/remix path. Provide a free local studio/player with all core recipes and the ability to use one's own supported provider. Sell workflow convenience, premium artistic choices, team production tools, maintained managed services and support. This is a business-model recommendation, not a requirement the user previously fixed.")
table(["Offer","Proposed value","Pricing hypothesis to test"], [
("Local studio and player","Create, play, inspect, remix and export using local/manual/BYO-provider workflows.","Free core."),
("Creator Pro","Batch workflows, advanced review, premium packs and managed convenience.","Test USD 19–29 per month."),
("Studio and teams","Shared production, roles, brand packs, review workflows and priority support.","Test USD 49–79 per editor per month."),
("Managed services","Optional authoring credits, persistent mailbox, backup and synchronization.","Meter or include a clearly stated quota."),
("Institutional support","Deployment, administration, procurement and support commitments.","Quote against actual needs.")
], [1.45,3.4,2.15])
p("These prices are experiments, not market findings or a revenue forecast. Validate willingness to pay with real purchasing decisions. Show AI/media costs separately and avoid an unlimited-use promise before measuring unit economics. Exported gameplay remains usable after a subscription ends.")
p("The initial customer acquisition focus can be educators, trainers, tutors and independent creators while content support remains broad. Demonstrate the product using unrelated technical, humanities and visual/procedural source collections. A prospect should be able to play a real export immediately.")
p("The proposed Teams offering requires an additional shared revision repository with owner, editor, reviewer and reader roles. Use explicit forks, review and publish actions initially; resolve conflicting revisions without silent overwrite. Test authorization, removal of access, recovery and export permissions before selling this offering. If these capabilities are not complete, launch the individual offering and keep Teams unavailable for purchase.")
h("Commercial release operations", 2)
bullets([
"Purchase, account/entitlement management, invoices, cancellation and refund procedures work end to end.",
"Signed installers, update channels, rollback and tested notebook migrations are available for declared platforms.",
"Publish a support matrix, source limitations, recovery guide, provider setup guide and short creator/player tutorials.",
"Assign owners for support, integration breakages, security updates, billing incidents and hosted service availability.",
"Collect opt-in operational diagnostics without including source content or learner answers by default.",
"Instrument cost per completed notebook, creator completion, recipient activation, paid conversion and support burden."
])
h("Rights and child data", 2)
p("Commission or license the ten tracks and core art for commercial embedding, redistribution and recipient remixing. Maintain composition/recording rights and attribution records. Creators choose appropriate licenses for their material. A public link or downloadable artifact does not by itself grant unrestricted resale rights.")
p("For covered U.S. online services collecting information from children under 13, implement the applicable parental notice/consent, access/deletion, security and retention requirements before operating child cloud or network features. Tor and pseudonymous identifiers do not automatically remove these obligations. Use local child profiles by default and determine the requirements in the actual markets served. [FTC guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)")
p("Treat source documents and imported packages as untrusted data. Sanitize displayed content, constrain extraction workers, reject dangerous archive paths and oversized expansion, and prevent source text from directing tools or credential access. An exported notebook supplies data to trusted engines rather than arbitrary privileged code.")

h("12 Delivery workstreams and milestones")
p("Build the complete product through internal milestones. Each milestone supplies evidence for the next decision; the full commercial release still includes the 50 promised recipes and complete user journeys.")
table(["Stage","Planning range","Exit evidence"], [
("Foundation","4–6 weeks","Requirements traceability, UX prototype, engine comparison, package schema, saving and Tor experiments."),
("Complete vertical flow","10–14 weeks","Several unrelated materials complete create–play–save–export–offline remix–re-export."),
("Catalog and visual production","20–30 weeks","All 50 recipes implemented and reviewed, with controls, feedback, access alternatives and result adapters."),
("Networking and services","10–16 weeks overlapping","Tor invitation/sync, encrypted mailbox option, recovery, billing and managed services."),
("Field validation and hardening","10–14 weeks","Unassisted usability, supported-device performance, learning evaluation, release/update/support readiness.")
], [1.55,1.35,4.1])
p("An initial planning envelope is 12–18 months with an experienced team for this full scope, assuming 2D presentation, browser creator/player, Windows/macOS launchers and the stated catalog. This is a planning estimate, not a committed delivery date. Re-estimate after the foundation milestone. Workstreams overlap; the ranges should not simply be added.")
table(["Responsibility","Suggested staffing"], [
("Product and customer research","1 product lead"),
("Interaction and interface design","1 senior product designer"),
("Game design and balancing","1 game designer"),
("Learning and assessment","1 learning designer/scientist"),
("Browser editor and player","3 engineers"),
("Extraction retrieval and AI","2 engineers"),
("Desktop storage and networking","1–2 engineers"),
("Art and animation","1 artist plus specialist contracts"),
("Quality accessibility and release","1–2 specialists"),
("Music legal and security review","Contract specialists")
], [3.5,3.5])
p("This implies roughly 12–15 core contributors, with some roles combined. A smaller team can retain the same product promise with a longer schedule. Agent assistance can accelerate implementation and review, but cannot replace observing learners, evaluating source accuracy or producing coherent art direction.")
p("Budget from monthly fully loaded staffing costs multiplied by the planned staffing curve, plus art/music contracts, learner research, independent reviews, infrastructure and a contingency allocation. Measure authoring and support costs during pilots before committing to prices.")
h("Critical dependencies", 2)
p("The notebook/assessment contracts precede broad recipe production. One complete offline round trip precedes export promises. Learning and art specifications precede parallel scaffold implementation. Shared scoring and durable saving precede networking. Provider permissions and child-service requirements must be resolved before advertising those specific integrations.")

h("13 Acceptance criteria for a sellable release")
p("The quality bar is demonstrated by outcomes. Assign an owner and retain test evidence for each criterion. Numerical targets below are proposed gates to calibrate on declared hardware and participant groups, not claims about an existing implementation.")
table(["Area","Required evidence"], [
("Requirement coverage","Every R01–R14 requirement maps to implemented features, tests, documentation and an accountable owner."),
("Complete catalog","All 50 recipes have executed tests, content fixtures, feedback, access alternatives, saving and multiplayer adapters."),
("Source reliability","Each advertised category has real fixtures; partial extraction and access failures are visible and recoverable."),
("Content integrity","Every factual assessment links to adequate evidence. Structural checks pass; semantic review records ambiguity and corrections."),
("Game coherence","No required mission is unreachable. Winning exercises the target capability. Controls and progression remain understandable."),
("Creator usability","Target 90% unassisted success on the core workflow in representative tests; investigate all critical failures."),
("Recipient independence","Network-disabled play, source inspection, manual remix and re-export complete without provider or account."),
("Saving and migration","Forced termination, failed writes, upgrades and device transfer recover the last confirmed state."),
("Multiplayer convergence","Duplicate, delayed and reordered updates converge to the same standings without duplicate awards."),
("Performance and access","Pass declared device/browser budgets and manual assistive-technology tests; no critical blockers."),
("Untrusted input and credentials","Pass malformed/archive expansion, script sanitization and prompt-injection isolation tests; exclude credentials from exports and verify networking identity/access controls."),
("Commercial operations","Checkout, delivery, activation where needed, cancellation, refunds, updates and support all tested."),
("Evidence and marketing","Claims match measured capabilities; integration limitations and support boundaries are accurate.")
], [1.55,5.45])
h("Learning evaluation", 2)
p("Compare generated campaigns with a strong active-practice condition using the same material and similar study time. Measure immediate performance, delayed retention and unfamiliar application separately from enjoyment and voluntary return. Determine sample sizes with the learning researcher after choosing outcomes and expected effects.")
p("Evaluate across different subject structures and audience bands. Include text-heavy, visual, procedural and mixed-media collections. Observe children with appropriate caregiver involvement. Record creator correction effort, unsupported claims, omitted objectives and confusing feedback alongside learner outcomes.")
p("A successful pilot in one subject does not validate every recipe. Use results to improve eligibility rules, feedback and defaults. Publish the scope of any effectiveness claim with its population, materials, comparison and measured outcome.")
h("Commercial validation", 2)
p("Measure whether people finish their first notebook, share it, see recipients activate it, and return to author another. Separately test whether advanced convenience is valuable enough to purchase. A free local core creates distribution, but paid conversion is a hypothesis that must be demonstrated.")

h("14 Decisions and immediate build sequence")
table(["Decision","Recommended baseline","What settles it"], [
("Game engine","Phaser for the 2D player with DOM/SVG companions.","Representative scene benchmark and accessibility prototype."),
("Desktop delivery","Tauri/Rust launcher for Windows and macOS first.","Installer, Tor, media and storage tests; expand support deliberately."),
("Portable artifact","Versioned learnpack plus compact HTML and launcher bundles.","Offline round trip, size/memory measurements and recipient usability."),
("AI access","BYO API keys and evaluated local models; approved subscription routes.","Provider policy/access and capability testing."),
("Tor availability","Launcher transport plus optional encrypted mailbox.","Two-device shutdown/reconnect and non-overlap delivery tests."),
("Commercial model","Free core with paid convenience and services.","Purchasing tests and measured support/infrastructure costs."),
("Language coverage","Unicode throughout; advertise evaluated UI/content languages.","Extraction, assessment, font and accessibility fixtures per language.")
], [1.4,3.05,2.55])
h("First four weeks", 2)
bullets([
"Week 1: freeze requirement IDs, define the notebook/assessment/save contracts, and collect representative source fixtures across unrelated domains.",
"Week 2: prototype the complete creator and recipient journeys; test source repair, editable previews and export choices with first-time users.",
"Week 3: build technical experiments for rendering, a saved interactive mission, large-media ingestion, offline package opening and two-device Tor messages.",
"Week 4: review measured results, choose the baseline stack, set device budgets and convert the milestone plan into owned engineering/design work."
])
p("The first implemented campaign should demonstrate the reusable product pipeline across multiple user source collections. It must include a meaningful learning interaction, evidence-linked feedback, a relevant visual, automatic saved state, and an editable offline export. Additional recipes then extend the established contracts.")
h("What must remain explicit", 2)
p("The plan meets the requested product scope through direct support and clearly described assisted paths. Universal automatic NotebookLM extraction, unrestricted use of every AI subscription, silent autosaving in every direct-file browser, and tamper-proof peer rankings are not currently defensible promises. Resolving those limits honestly is part of delivering an excellent usable product.")
p("The next deliverable after this plan is a tested interaction prototype and the foundation milestone evidence. Production release follows completion of the full catalog and the acceptance criteria above.")

doc.save(OUT / "Learning_Game_Studio_Product_Plan.docx")
print(OUT / "Learning_Game_Studio_Product_Plan.docx")
print(f"General recipes: {len(general)}; age-adapted recipes: {len(kids)}; total: {len(general)+len(kids)}")
