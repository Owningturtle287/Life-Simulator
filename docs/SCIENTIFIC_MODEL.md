# Scientific model and limits

Life Simulator uses an explicit artificial chemistry. It makes a few questions about compartmentalization, heredity, energy, and selection visible and interactive. Its outcomes are outcomes of these rules, not claims about the historical route by which Earth acquired life.

## Representation

A colored packet represents a coarse molecular collection or domain, not a single atom. Every packet has a position, velocity, type, orientation, energy variable, and stable ID. Nucleotide packets also carry A/U/G/C, lineage, and generation metadata. Bonds connect actual packet IDs and have a spring rest length and age.

A membrane is a closed amphiphile bond cycle. Its displayed outline follows those vertices, including distortion, growth, rupture, and reconnection. A single chain stands in for a bilayer. Closed cycles of 7–160 packets with sufficient area are detected every half model second. A **model cell** is an enclosure containing an RNA-like chain and catalytic or photoactive material. This operational label is not a biological viability assay: metabolism can be temporarily unfueled while the structure remains counted.

There are eight types: amphiphile, nucleotide, catalytic peptide, photoactive molecule, contractile peptide, binding peptide, nutrient, and spent material. Choosing useful primitive reaction rules is a deliberate modeling assumption. At present, component types do not themselves evolve new chemical properties.

## Dynamics

The worker integrates at a fixed 1/60 model-second step. Spatial bins limit neighbor queries. Each step includes thermal random forcing, prescribed currents, short-range repulsion, pair attractions, springs, drag, a membrane permeability approximation, and boundaries. Temperature changes noise and reaction activity; pH changes activity; salinity changes amphiphile attachment and bond stability. The activity function peaks near the default mild conditions. These are illustrative response curves, not fitted chemical kinetics.

Light energizes photoactive packets and slowly activates nucleotides. Catalysts transform a nearby nutrient into spent material and transfer part of its stored energy to neighboring packets. Mineral-associated illuminated waste can recycle to nutrient. Catalysts enable reactions; they do not create an unlimited supply of energy. Energy is an abstract bookkeeping variable with external light input and dissipative loss, not a calibrated thermodynamic free-energy calculation.

Amphiphiles prefer two lipid neighbors. Local bending forces favor smooth chains; a boundary pressure approximation resists collapse. Contractile peptide bonds consume energy and oscillate in length. A local orientation-dependent force approximates active motion in water. This is not a Navier–Stokes solver or a hydrodynamically calibrated flagellar motor. Asymmetry, collisions, attachments, and currents affect the net motion; cells have no hunt/flee/steer scripts.

A large structure can grow by inserting nearby free amphiphiles into its actual boundary. If nonadjacent boundary segments meet at a narrow neck, a coarse reconnection rule can split that bond cycle into two cycles. There is no division timer, genome-count trigger, or duplicated daughter object. Such a split does **not** guarantee both daughters inherit useful contents. This reconnection is a chosen physical analogy, not a derivation of membrane fission from atomistic forces.

## Heredity and variation

Four or more linked nucleotide packets define an RNA-like polymer. A template can recruit existing activated complementary nucleotides near it if a fueled catalytic packet is available. Participants must occupy the same side of detected membrane boundaries. Each recruitment consumes energy and may miscopy, with an adjustable base error probability and additional high-temperature errors.

The recruitment step places the existing packet beside its template position. This is a coarse reaction event; it does not resolve a molecular binding trajectory. Only intact completed strands count as successful copies and receive the next generation number. Incomplete strands can stall or lose bonds. Template attempts expire after a bounded interval. Completed complementary strands keep the parental lineage unless an error occurred, in which case their sequence establishes a variant identifier. Present sequences and conditions affect future copying success; longer chains need more resources.

A small artificial motif code couples sequence to local synthesis. Existing nutrient packets become structural packets using catalyst energy:

| Sequence feature | Available synthesis product |
| --- | --- |
| Any copying-capable chain | Activated nucleotide precursor |
| AU or UA | Amphiphile |
| GC or CG | Catalytic peptide |
| GG or CC | Photoactive molecule |
| UU or AA | Contractile peptide |
| AG or CU | Binding peptide |

Products are selected from the matching options. This is not the biological genetic code, protein folding, a ribosome, or modern gene regulation. Its purpose is to make inherited sequence affect local chemistry rather than to assign named organism behaviors. Molecular generations are not necessarily cell generations. Lineage IDs are bookkeeping labels, not formally delimited species. Inactive lineage records expire after 120 model seconds, and the visible lineage list shows recently detected polymers.

## Compartments, association, and complexity

Nested cycles are recognized from geometry. Binding peptides make reversible membrane attachments and can bridge compartments with different lineage labels. The observation panel counts connected aggregates. These are ingredients for examining compartmentalization and association; they do not establish obligate endosymbiosis, coordinated development, differentiation, or a genuine multicellular organism.

The alternative starting modes introduce explicit molecular arrangements as initial conditions. The primordial mode has no preassembled cells or scheduled stage upgrades. All modes retain free matter and use the same rules. A seeded “eukaryotic” world contains nested analogue compartments, not a complete nucleus/mitochondrial system. The model does not promise that a primordial run will become prokaryotic, eukaryotic, or multicellular on any schedule.

There is no complete meiosis, gamete formation, fertilization, sexual reproduction, or modeled homologous recombination. Some polymers may join or break through the generic bond rules, but that should not be described as biological sex. Richer developmental and reproductive machinery would require additional chemical mechanisms, validation, and substantially more computation.

## Conservation, interventions, and replay

Reactions convert existing packets; template copying recruits existing packets; membrane splitting reconnects existing packets. The count ledger satisfies:

`current packets = initial packets + nutrient influx + deliberate additions − waste outflow`

Equal packet count is **not** exact conservation of atoms or molecular mass: packet types are abstract and have no elemental stoichiometry. Light is external energy. Sources supply nutrient. Spent material can leave near the rectangular bounding limits. The budget stops additions instead of silently killing organisms. Builder and brush additions are recorded separately. Resizing translates enclosures with their contents where possible; strongly compressed borders can disrupt them.

Same seed, configuration, ordered interventions, and number of steps reproduce the model in the same JavaScript engine. A JSON checkpoint preserves the random generator, IDs, sampled boundaries, history, and unfinished templates. Wall-clock performance is not deterministic, and exact bitwise agreement between different browser engines is not promised because floating-point transcendental implementations may differ.

Model units do not correspond to micrometers, molecular time scales, or geological years. Parameter ranges and acceleration are intended for exploration. The model has not been fitted to or validated against an experimental dataset.

## Research context

These papers motivate questions rather than validate this implementation:

- Powner, Gerland & Sutherland (2009), [Synthesis of activated pyrimidine ribonucleotides in prebiotically plausible conditions](https://www.nature.com/articles/nature08013): experimentally grounded building-block chemistry. The app begins with coarse ingredients already available; it does not simulate these synthetic pathways.
- Attwater et al. (2018), [Ribozyme-catalysed RNA synthesis using triplet building blocks](https://elifesciences.org/articles/35255): experimental progress and obstacles in RNA-catalyzed copying. The app's packet copier is far simpler and is not the reported ribozyme.
- [Clonal-aggregative multicellularity tuned by salinity in a choanoflagellate](https://www.nature.com/articles/s41586-026-10137-y) (2026): experimental work on clonal growth and aggregation. Adhesive aggregates in this app do not reproduce the study's organisms or developmental mechanisms.

A full account of life's origin remains an active scientific problem. A visually plausible simulation is not evidence that a particular historical pathway occurred.
