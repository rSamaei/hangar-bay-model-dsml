grammar Airfield

entry Model:
    'airfield' name=ID '{'
        (aircraftTypes+=AircraftType
        | hangars+=Hangar
        | inductions+=Induction)*
    '}';

AircraftType:
    'aircraft' name=ID '{'
        'wingspan' wingspan=FLOAT 'm'
        'length'   length=FLOAT 'm'
        'height'   height=FLOAT 'm'
    '}';

Hangar:
    'hangar' name=ID '{'
        'bays'    bays=INT
        'bayWidth'  bayWidth=FLOAT 'm'
        'bayDepth'  bayDepth=FLOAT 'm'
        'height'    height=FLOAT 'm'
    '}';

Induction:
    'induct' aircraft=[AircraftType:ID]
      'into' hangar=[Hangar:ID]
      'bays' fromBay=INT '..' toBay=INT
      ';';

// tokens
hidden terminal WS: /\s+/;
terminal INT returns number: /[0-9]+/;
terminal FLOAT returns number: /[0-9]+(\.[0-9]+)?/;
terminal ID: /[_a-zA-Z][\w_]*/;
