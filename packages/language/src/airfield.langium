grammar Airfield

entry Model:
    'airfield' name=ID '{'
        (aircraftTypes+=AircraftType
        | clearanceEnvelopes+=ClearanceEnvelope
        | hangars+=Hangar
        | accessPaths+=AccessPath
        | inductions+=Induction
        | autoInductions+=AutoInduction)*
    '}';

// ---------------------------------------------------------------------------
// Aircraft with geometry for derived properties
// ---------------------------------------------------------------------------

AircraftType:
    'aircraft' name=ID '{'
        'wingspan' wingspan=FVAL 'm'
        'length'   length=FVAL 'm'
        'height'   height=FVAL 'm'
        ('tailHeight' tailHeight=FVAL 'm')?
        ('clearance' clearance=[ClearanceEnvelope:ID])?
    '}';

// ---------------------------------------------------------------------------
// Clearance envelope for safety margins
// ---------------------------------------------------------------------------

ClearanceEnvelope:
    'clearance' name=ID '{'
        'lateralMargin' lateralMargin=FVAL 'm'
        'longitudinalMargin' longitudinalMargin=FVAL 'm'
        'verticalMargin' verticalMargin=FVAL 'm'
    '}';

// ---------------------------------------------------------------------------
// Hangar with doors and BayGrid
// ---------------------------------------------------------------------------

Hangar:
    'hangar' name=ID '{'
        'doors' '{' doors+=HangarDoor+ '}'
        'grid' grid=BayGrid
    '}';

HangarDoor:
    'door' name=ID '{'
        'width'  width=FVAL 'm'
        'height' height=FVAL 'm'
        ('accessNode' accessNode=[AccessNode:ID])?
    '}';

BayGrid:
    'baygrid' '{'
        ('rows' rows=INT 'cols' cols=INT)?
        ('adjacency' adjacency=INT)?              // 4-connected (default) or 8-connected
        bays+=HangarBay+
    '}';

HangarBay:
    'bay' name=ID '{'
        ('at' 'row' row=INT 'col' col=INT)?
        'width'  width=FVAL 'm'
        'depth'  depth=FVAL 'm'
        'height' height=FVAL 'm'
        ('adjacent' '{' adjacent+=[HangarBay:ID]+ '}')?
        (traversable?='traversable')?
        ('accessNode' accessNode=[AccessNode:ID])?
    '}';

// ---------------------------------------------------------------------------
// Access connectivity and reachability modeling
// ---------------------------------------------------------------------------

AccessPath:
    'accessPath' name=ID '{'
        'nodes' '{' nodes+=AccessNode+ '}'
        'links' '{' links+=AccessLink+ '}'
    '}';

AccessNode:
    'node' name=ID
        ('width' width=FVAL 'm')?          // optional dimension constraints
        ('clearanceHeight' height=FVAL 'm')?
    ;

AccessLink:
    'link' from=[AccessNode:ID] 'to' to=[AccessNode:ID]
        ('bidirectional' bidirectional?='true')?   // default is unidirectional
        ('type' type=AccessLinkType)?              // future: tow, taxi, etc.
    ;

AccessLinkType returns string:
    'tow' | 'aisle' | 'taxi' | 'threshold';

// ---------------------------------------------------------------------------
// Induction with explicit identity and validation hooks
// ---------------------------------------------------------------------------

Induction:
    'induct'
        ('id' id=STRING)?
        aircraft=[AircraftType:ID]
        'into' hangar=[Hangar:ID]
        'bays' bays+=[HangarBay:ID]+
        ('via' door=[HangarDoor:ID])?
        ('clearance' clearance=[ClearanceEnvelope:ID])?
        ('span' span=SpanDirection)?        // optional span axis (lateral | longitudinal)
        ('requires' requires=INT 'bays')?   // optional declared minimum bay count
        'from' start=DATETIME
        'to'   end=DATETIME

        (metadata=InductionMetadata)?
    ';';

// 2.1: Span direction for multi-bay inductions
SpanDirection returns string:
    'lateral' | 'longitudinal';

// Metadata block for validation reporting and export
InductionMetadata:
    'meta' '{'
        (tags+=Tag)*                         // extensible key-value pairs
    '}';

Tag:
    key=ID ':' value=STRING;

AutoInduction:
    'auto-induct'
        ('id' id=STRING)?
        aircraft=[AircraftType:ID]
        'duration' duration=INT 'minutes'
        ('prefer' preferredHangar=[Hangar:ID])?
        ('clearance' clearance=[ClearanceEnvelope:ID])?
        ('requires' requires=INT 'bays')?   // optional declared minimum bay count

        ('after' precedingInductions+=[Induction:ID]+)?    // simple precedence
        ('notBefore' notBefore=DATETIME)?                  // time window constraint
        ('notAfter' notAfter=DATETIME)?

        (metadata=InductionMetadata)?
    ';';

// ---------------------------------------------------------------------------
// Data type rules
// ---------------------------------------------------------------------------

// Physical dimension value: accepts both integer (e.g. 11) and decimal (e.g. 11.5) literals.
FVAL returns number: FLOAT | INT;

// ---------------------------------------------------------------------------
// Terminals
// ---------------------------------------------------------------------------

hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

terminal DATETIME: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
terminal STRING: /"[^"]*"|'[^']*'/;

terminal FLOAT returns number: /[0-9]+\.[0-9]+/;
terminal INT returns number: /[0-9]+/;
terminal ID: /[_a-zA-Z][\w_]*/;
