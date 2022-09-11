const eventname = {
    VoiceNoteOff: 0x80,
    VoiceNoteOn: 0x90,
	VoiceAftertouch: 0xA0,
	VoiceControlChange: 0xB0,
	VoiceProgramChange: 0xC0,
	VoiceChannelPressure: 0xD0,
	VoicePitchBend: 0xE0,
	SystemExclusive: 0xF0,
};

const metaevent = {
    MetaSequence: 0x00,
	MetaText: 0x01,
	MetaCopyright: 0x02,
	MetaTrackName: 0x03,
	MetaInstrumentName: 0x04,
	MetaLyrics: 0x05,
	MetaMarker: 0x06,
	MetaCuePoint: 0x07,
	MetaChannelPrefix: 0x20,
	MetaEndOfTrack: 0x2F,
	MetaSetTempo: 0x51,
	MetaSMPTEOffset: 0x54,
	MetaTimeSignature: 0x58,
	MetaKeySignature: 0x59,
	MetaSequencerSpecific: 0x7F,
};

function testbit(v, i) {
    return (v & i) == i;
};

function u8(n) {
    return n & 0xFF;
};

function u16(n) {
    return n & 0xFFFF;
};

function u32(n) {
    return n & 0xFFFFFFFF;
};

function int8(value) {
    value = u8(value);
    let a = (value & 0x80) == 0x80; 
    let b = value & 0x7F;
    return a && -0x80 + b || !a && b;
};

function int16(value) {
    value = u16(value);
    let a = (value & 0x8000) == 0x8000;
    let b =  value & 0x7FFF;
    return a && -0x8000 + b || !a && b;
}; 

function int32(value) {
    value = u32(value);
    let a = (value & 0x80000000) == 0x80000000;
    let b =  value & 0x7FFFFFFF;
    return a && -0x80000000 + b || !a && b;
}; 

function sint32(value) {
    let numbers = value & 0x7FFFFFFF;
    return Math.abs(value) != value && (0^numbers) + 0x80000000 || numbers;
};

function ReadU16(index, address) {
    return (index[address] << 8) | index[address + 1];
};

function ReadU24(index, address) {
    return (index[address] << 16) | (index[address + 1] << 8) | (index[address + 2]);
};

function ReadU32(index, address) {
    return (index[address] << 24) | (index[address + 1] << 16) | (index[address + 2] << 8) | (index[address + 3]);
};

function BReadU32(index, address) {
    return (index[address] << 24) | (index[address + 1] << 16) | (index[address + 2] << 8) | (index[address + 3]);

};

function ReverseOrder32(value) { 
    return (value & 0xFF000000) >>> 24 | (value & 0xFF0000) >>> 8 | (value & 0xFF00) << 8 | (value & 0xFF) << 24;
};

var input = document.getElementById("file");

function openfile(evt) {
  var files = input.files;
  fileData = new Blob([files[0]]);
  var promise = new Promise(getBuffer(fileData));
  promise.then(function(data) {
        init(data);
    })
    .catch(function(err) {
    console.log('Error: ',err);
  });
};

function getBuffer(fileData) {
    return function(resolve) {
    var reader = new FileReader();
    reader.readAsArrayBuffer(fileData);
        reader.onload = function() {
            var arrayBuffer = reader.result;
            var bytes = new Uint8Array(arrayBuffer);
            resolve(bytes);
        };
    };
};

input.addEventListener('change', openfile, false);

function midi(mem) {
    let obj = Object.create(midi_constructor);
    obj.memory = mem;
    obj.header = {
        FileID: 0,
        HeaderLength: 0,
        Format: 0,
        TrackChunks: 0,
        Division: 0,
    };
    obj.track_pointer = 0;
    obj.tracks = [];
    return obj;
};

var midi_constructor = {
    Track8: function() {
        let v = this.memory[this.track_pointer];
        this.track_pointer += 1;
        return v
    },

    Track16: function() {
        let v = ReadU16(this.memory, this.track_pointer);
        this.track_pointer += 2;
        return v;
    },

    Track24: function() {
        let v = ReadU24(this.memory, this.track_pointer);
        this.track_pointer += 3;
        return v;
    },
    Track32: function() {
        let v = ReadU32(this.memory, this.track_pointer);
        this.track_pointer += 4;
        return v;
    },
    Read: function() {
        let value = 0;
        for(;;) {
            let byte = this.Track8(); 
            value = (value << 7) + (byte & 0x7F);
            if (byte < 0x80) break;
        };
        return value;
    },
    ReadString: function(nlength) {
        let s = "";
        for (i=0;i<nlength;i++) s += String.fromCharCode(this.Track8());
        return s;
    },
    ParseMID: function() {
        let temporary = this.header;
        temporary.FileID = ReadU32(this.memory, 0);
        temporary.HeaderLength = ReadU32(this.memory, 0x4);
        temporary.Format = ReadU16(this.memory, 0x8); 
        temporary.TrackChunks = ReadU16(this.memory,0xA);
        temporary.Division = ReadU16(this.memory,0xC)

        this.track_pointer = 0xE;

        for (nchunk = 0; nchunk < temporary.TrackChunks; nchunk++) {
            let tr = {
                Track: "",
                Events: []

            }

            tr.Track = `Track ${nchunk + 1}`;

            let trackid = this.Track32();
            let tracksize = this.Track32();
            let track_end = false;

            let stat = 0;
            let evcommand = 0;
            let evchannel = 0;
    
            while (track_end == false) {
                let deltaticks = this.Read();
                let command = this.Track8();
    
                if (command < 0x80) {
                    command = stat;
                    evcommand = command & 0xf0;
                    evchannel = command & 0xf;
                    this.track_pointer -= 1;
                } else if (command < 0xf0) {
                    stat = command;
                    evcommand = command & 0xf0;
                    evchannel = command & 0xf;
                } else {
                    evcommand = command;
                };
                /*  
                    This here goes for midi events
                */
                    if (evcommand == eventname.VoiceNoteOff) {
                        let key = this.Track8();
                        let velocity = this.Track8();  
                    } else if (evcommand == eventname.VoiceNoteOn) {
                        let key = this.Track8();
                        let velocity = this.Track8();  
                    } else if (evcommand == eventname.VoiceAftertouch) {
                        let key = this.Track8();
                        let velocity = this.Track8(); 
                    } else if (evcommand == eventname.VoiceControlChange) {
                        let control = this.Track8();
                        let control_value = this.Track8(); 
                    } else if (evcommand == eventname.VoiceProgramChange) {
                        let program = this.Track8();
                    } else if (evcommand == eventname.VoiceChannelPressure) {
                        let pressure = this.Track8();
                    } else if (evcommand == eventname.VoicePitchBend) {
                        let blend1 = this.Track8();
                        let blend2 = this.Track8();  
                    } else if ((evcommand & 0xF0) == eventname.SystemExclusive) {

                        let type = this.Track8();
                        let nlength = this.Read();
                        let tex, B1, B2, B3, B4, B5;
                        switch (type) {
                            case metaevent.MetaSequence:
                                 B1 = this.Track8();
                                 B2 = this.Track8();      
                            break;
                            case metaevent.MetaText:
                                tex = this.ReadString(nlength);
                            break;
                            case metaevent.MetaCopyright:
                                tex = this.ReadString(nlength);
                            break;
                            case metaevent.MetaTrackName:
                                tex = this.ReadString(nlength);
                                tr.Track = tex;
                            break;
                            case metaevent.MetaInstrumentName:
                                tex = this.ReadString(nlength);
                            break;
                            case metaevent.MetaLyrics:
                                tex = this.ReadString(nlength);
                            break;
                            case metaevent.MetaMarker:
                                tex = this.ReadString(nlength);
                            break;
                            case metaevent.MetaCuePoint:
                                tex = this.ReadString(nlength);
                            break;
                            case metaevent.MetaChannelPrefix:
                                B1 = this.Track8();
                            break;
                            case metaevent.MetaEndOfTrack:
                                track_end = true;
                            break;
                            case metaevent.MetaSetTempo:
                               let tempo = this.Track24();
                            break;
                            case metaevent.MetaSMPTEOffset:
                                B1 = this.Track8();
                                B2 = this.Track8();   
                                B3 = this.Track8();
                                B4 = this.Track8();   
                                B5 = this.Track8(); 
                            break;
                            case metaevent.MetaTimeSignature:
                                B1 = this.Track8();
                                B2 = this.Track8();   
                                B3 = this.Track8();    
                                B4 = this.Track8();                   
                            break;
                            case metaevent.MetaKeySignature:
                                B1 = this.Track8();
                                B2 = this.Track8();   
                            break;
                            case metaevent.MetaSequencerSpecific:
                                tex = this.ReadString(nlength);
                            break;

                            default:
                            // Unrecognised
                            console.log(`Unrecognised MetaEvent: ` + type);
                        };

                        if (evcommand == 0xF0) {
                            // System Exclusive Message Begin
                            let tex = this.ReadString(this.Read());
                        };
    
                        if (evcommand == 0xF7) {
                            // System Exclusive Message Begin
                            let tex = this.ReadString(this.Read());
                        };

                    } else {
                        // Unrecognised
                        console.log(`Unrecognised Status Byte: ` + evcommand);
                    };

            };

            this.tracks.push(tr);
        };

        this.header = temporary;
    }
};

function init(data) {
    input.remove();
    let MID = midi(data);
    MID.ParseMID();

    console.log(MID);
};

