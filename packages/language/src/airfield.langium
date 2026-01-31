grammar Airfield

entry Model:
    'airfield' name=ID '{'
        (aircraftTypes+=AircraftType
        | clearanceEnvelopes+=ClearanceEnvelope
        | hangars+=Hangar
        | accessPaths+=AccessPath              // NEW: access connectivity
        | inductions+=Induction
        | autoInductions+=AutoInduction)*
    '}';

// ---------------------------------------------------------------------------
// Aircraft with geometry for derived properties
// ---------------------------------------------------------------------------

AircraftType:
    'aircraft' name=ID '{'
        'wingspan' wingspan=FLOAT 'm'
        'length'   length=FLOAT 'm'
        'height'   height=FLOAT 'm'
        ('tailHeight' tailHeight=FLOAT 'm')?
        ('clearance' clearance=[ClearanceEnvelope:ID])?
    '}';

// ---------------------------------------------------------------------------
// Clearance envelope for safety margins
// ---------------------------------------------------------------------------

ClearanceEnvelope:
    'clearance' name=ID '{'
        'lateralMargin' lateralMargin=FLOAT 'm'
        'longitudinalMargin' longitudinalMargin=FLOAT 'm'
        'verticalMargin' verticalMargin=FLOAT 'm'
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
        'width'  width=FLOAT 'm'
        'height' height=FLOAT 'm'
        // NEW: optional access node hook for path connectivity
        ('accessNode' accessNode=[AccessNode:ID])?
    '}';

BayGrid:
    'baygrid' '{'
        ('rows' rows=INT 'cols' cols=INT)?
        bays+=HangarBay+
    '}';

HangarBay:
    'bay' name=ID '{'
        ('at' 'row' row=INT 'col' col=INT)?
        'width'  width=FLOAT 'm'
        'depth'  depth=FLOAT 'm'
        'height' height=FLOAT 'm'
        ('adjacent' '{' adjacent+=[HangarBay:ID]+ '}')?
        
        // NEW: optional access node for path connectivity
        ('accessNode' accessNode=[AccessNode:ID])?
    '}';

// ---------------------------------------------------------------------------
// NEW: Access connectivity and reachability modeling
// ---------------------------------------------------------------------------

AccessPath:
    'accessPath' name=ID '{'
        'nodes' '{' nodes+=AccessNode+ '}'
        'links' '{' links+=AccessLink+ '}'
    '}';

AccessNode:
    'node' name=ID
        ('width' width=FLOAT 'm')?          // optional dimension constraints
        ('clearanceHeight' height=FLOAT 'm')?
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
        ('id' id=STRING)?                   // NEW: explicit identity for reporting
        aircraft=[AircraftType:ID]
        'into' hangar=[Hangar:ID]
        'bays' bays+=[HangarBay:ID]+
        ('via' door=[HangarDoor:ID])?
        ('clearance' clearance=[ClearanceEnvelope:ID])?
        'from' start=DATETIME
        'to'   end=DATETIME
        
        // NEW: optional metadata for reporting and traceability
        (metadata=InductionMetadata)?
    ';';

// NEW: Metadata block for validation reporting and export
InductionMetadata:
    'meta' '{'
        (tags+=Tag)*                         // extensible key-value pairs
    '}';

Tag:
    key=ID ':' value=STRING;

AutoInduction:
    'auto-induct' 
        ('id' id=STRING)?                   // NEW: explicit identity
        aircraft=[AircraftType:ID]
        'duration' duration=INT 'minutes'
        ('prefer' preferredHangar=[Hangar:ID])?
        ('clearance' clearance=[ClearanceEnvelope:ID])?
        
        // NEW: forward-compatible scheduling hooks (OPTIONAL, future-facing)
        ('after' precedingInductions+=[Induction:ID]+)?    // simple precedence
        ('notBefore' notBefore=DATETIME)?                  // time window constraint
        ('notAfter' notAfter=DATETIME)?
        
        (metadata=InductionMetadata)?
    ';';

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
