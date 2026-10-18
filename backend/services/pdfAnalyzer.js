const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { PDFParse } = require('pdf-parse');

let GoogleGenAI;
try {
    const genaiMod = require('@google/genai');
    GoogleGenAI = genaiMod.GoogleGenAI;
} catch (e) {
    GoogleGenAI = null;
}

// Models
const Experiment = require('../models/Experiment');
const LabManual = require('../models/LabManual');
const QuestionSet = require('../models/QuestionSet');
const Component = require('../models/Component');
const AuditLog = require('../models/AuditLog');

// Knowledge Base for Real Lab Curriculums
const ADC_CIRCUITS_EXPERIMENTS = [
    {
        num: 1,
        title: 'Applications of Operational Amplifier (Inverting, Non-Inverting, Summer, Subtractor, Voltage Follower)',
        aim: 'To study and verify the operational amplifier applications using IC 741: Inverting amplifier, Non-inverting amplifier, Voltage follower, Summing amplifier, and Subtractor.',
        description: 'Study closed-loop negative feedback op-amp configurations. Measure closed-loop gain Av = -Rf/Ri for inverting mode, Av = 1 + (Rf/Ri) for non-inverting mode, unity-gain buffering, and algebraic sum/difference of DC and AC voltages.',
        objectives: [
            'Assemble inverting and non-inverting configurations on breadboard',
            'Verify virtual ground concept at the inverting terminal',
            'Measure closed loop gain across varying feedback resistance Rf',
            'Demonstrate voltage addition and subtraction with precision DC inputs'
        ],
        instructions: '1. Power IC 741 with dual regulated DC supply +/- 15V. Connect pin 7 to +15V, pin 4 to -15V. 2. For inverting amplifier, set Ri=1k, Rf=10k (Gain = -10). Apply 100mV peak-to-peak 1kHz sine wave. 3. Observe 180-degree phase inversion on dual channel DSO. 4. Verify non-inverting non-phase shifted output and voltage follower unity buffer.',
        components: [
            { componentName: 'Operational Amplifier IC 741', partNumber: 'IC-LM741', quantity: 2, notes: '8-pin DIP Package' },
            { componentName: 'Precision Resistors (1k, 10k, 100k Ohm)', partNumber: 'RES-PREC-SET', quantity: 8, notes: '1/4W 1% metal film' },
            { componentName: 'Dual Power Supply (+/- 15V)', partNumber: 'EQP-RPS-DUAL', quantity: 1, notes: 'Regulated DC dual rails' },
            { componentName: 'Function Generator (0-2 MHz)', partNumber: 'EQP-FG-20MHZ', quantity: 1, notes: 'Sine/Square signal source' },
            { componentName: 'Digital Storage Oscilloscope (DSO 0-20MHz)', partNumber: 'EQP-DSO-100MHZ', quantity: 1, notes: 'Dual channel waveform observation' },
            { componentName: 'Solderless Breadboard & Jumper Wire Set', partNumber: 'KIT-BB-JMP', quantity: 1, notes: 'Circuit breadboarding' }
        ],
        questions: [
            {
                questionText: 'What is the theoretical input impedance of an ideal operational amplifier?',
                options: ['Infinite (draws zero input current)', 'Zero Ohms', '50 Ohms', '1000 Ohms'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In an inverting amplifier with Rf = 10k Ohm and Ri = 1k Ohm, what is the ideal closed-loop voltage gain?',
                options: ['-10', '+10', '+11', '-1'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the voltage gain and input-output phase relationship of a Voltage Follower buffer?',
                options: ['Gain = +1 (in-phase 0 degrees)', 'Gain = -1 (180 degrees phase shift)', 'Gain = 100', 'Gain = 0'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Why is dual power supply (+15V and -15V) needed for linear op-amp operation?',
                options: ['To allow output to swing symmetrically through positive and negative polarities', 'To increase input resistance', 'To double the clock frequency', 'To prevent capacitor leakage'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 2,
        title: 'Differentiator and Integrator Circuits using OP-AMP',
        aim: 'To design and implement Op-Amp differentiator and integrator circuits using IC 741 and observe response to square and sine wave inputs.',
        description: 'In an integrator, the output voltage is proportional to the time integral of input voltage: Vo = -1/(R1*Cf) integral(Vi dt). In a differentiator, the output voltage is proportional to time rate of change of input: Vo = -Rf*C1 * (dVi/dt).',
        objectives: [
            'Observe conversion of square wave to triangular wave using op-amp integrator',
            'Observe spike and cosine generation from square and sine waves using differentiator',
            'Design shunt feedback resistor Rf to limit low-frequency integrator drift'
        ],
        instructions: '1. Connect IC 741 integrator with R1=10k, Cf=0.01uF, and shunt stabilization resistor Rf=100k. 2. Apply 1 kHz square wave from function generator. 3. Observe triangular output on DSO. 4. Switch to differentiator circuit and observe spike pulses at clock edges.',
        components: [
            { componentName: 'Operational Amplifier IC 741', partNumber: 'IC-LM741', quantity: 1, notes: 'Op-amp' },
            { componentName: 'Polyester Film Capacitors (0.01uF, 0.1uF)', partNumber: 'CAP-POLY-SET', quantity: 4, notes: 'Integrator/Differentiator timing' },
            { componentName: 'Resistors (1.5k, 10k, 100k Ohm)', partNumber: 'RES-ASSORTED', quantity: 6, notes: 'Gain and stability' },
            { componentName: 'Function Generator & DSO', partNumber: 'EQP-FG-DSO', quantity: 1, notes: 'Test and measurement' }
        ],
        questions: [
            {
                questionText: 'When a symmetrical square wave is applied to an ideal op-amp integrator, what waveform appears at the output?',
                options: ['Triangular wave', 'Spike pulses', 'Constant DC zero', 'Sinusoidal wave of double frequency'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Why is a high-value resistor placed in parallel with the feedback capacitor in a practical integrator?',
                options: ['To prevent saturation caused by low-frequency gain and input offset currents', 'To increase high-frequency gain', 'To double the slew rate', 'To invert the signal polarity'],
                correctOptionIndex: 0
            },
            {
                questionText: 'When a sine wave input is fed into an op-amp differentiator, the output is:',
                options: ['A cosine wave with 90 degree phase lead', 'A square wave with clipped edges', 'A DC voltage level', 'An exponential ramp'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is a common stability problem with pure differentiator circuits at high frequencies?',
                options: ['High-frequency noise amplification and circuit oscillation', 'Loss of input impedance', 'Excessive DC power consumption', 'Capacitor overheating'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 3,
        title: 'Active Low Pass, High Pass and Band Pass Filters',
        aim: 'To design, construct, and plot the frequency response of first-order and second-order Active Butterworth Low Pass, High Pass, and Band Pass Filters.',
        description: 'Active filters use op-amps and RC networks to provide frequency-selective filtering without inductive components. The cutoff frequency fc = 1 / (2*pi*R*C) provides -3dB roll-off with flat passband response.',
        objectives: [
            'Measure cutoff frequency fc = 1 / (2 * pi * R * C)',
            'Plot voltage gain in dB versus frequency from 100 Hz to 100 kHz on semi-log scale',
            'Determine roll-off rate (-20 dB/decade for 1st order, -40 dB/decade for 2nd order)'
        ],
        instructions: '1. Connect active filter circuit according to manual schematic with R=10k, C=0.01uF. 2. Set function generator amplitude to 1V RMS. 3. Sweep frequency from 100Hz to 50kHz. 4. Record output amplitude and calculate gain in dB.',
        components: [
            { componentName: 'Operational Amplifier IC 741', partNumber: 'IC-LM741', quantity: 2, notes: 'Active filter stage' },
            { componentName: 'Precision Mylar Capacitors (0.01uF)', partNumber: 'CAP-MYLAR-01', quantity: 4, notes: 'Filter timing' },
            { componentName: 'Metal Film Resistors (10k, 20k, 47k Ohm)', partNumber: 'RES-PREC-SET', quantity: 6, notes: 'Butterworth damping' },
            { componentName: 'Dual Power Supply & Oscilloscope', partNumber: 'EQP-LAB-BASIC', quantity: 1, notes: 'Bench instruments' }
        ],
        questions: [
            {
                questionText: 'What is the cutoff frequency formula for a first-order active low-pass RC filter?',
                options: ['fc = 1 / (2 * pi * R * C)', 'fc = 2 * pi * R * C', 'fc = R / (2 * pi * C)', 'fc = 1 / (R * C)'],
                correctOptionIndex: 0
            },
            {
                questionText: 'At the cutoff frequency fc, what is the output gain in dB relative to the maximum passband gain?',
                options: ['-3 dB (0.707 of passband voltage)', '-6 dB', '0 dB', '-20 dB'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the attenuation roll-off slope for a second-order active filter in the stopband?',
                options: ['-40 dB per decade (-12 dB per octave)', '-20 dB per decade', '-6 dB per decade', '-80 dB per decade'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Butterworth filters are particularly famous in circuit design for exhibiting:',
                options: ['Maximally flat magnitude response in the passband', 'Steepest transition with ripple', 'Linear phase in stopband only', 'Zero insertion loss'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 4,
        title: 'Instrumentation Amplifier using OP-AMP',
        aim: 'To design and study a three op-amp Instrumentation Amplifier for differential signal measurement with high Common Mode Rejection Ratio (CMRR).',
        description: 'An instrumentation amplifier consists of two non-inverting input buffer stages driving a differential amplifier. It provides extremely high input impedance, high CMRR, and adjustable gain using a single resistor Rg: Av = (1 + 2R1/Rg) * (R3/R2).',
        objectives: [
            'Assemble 3-op-amp instrumentation amplifier circuit',
            'Measure differential gain Ad and common-mode gain Ac',
            'Calculate CMRR = 20 * log10(|Ad / Ac|) in dB',
            'Demonstrate common-mode noise cancellation'
        ],
        instructions: '1. Wire three IC 741 op-amps on breadboard with matched 10k resistors. 2. Apply common-mode AC signal to both inputs and verify near-zero output. 3. Apply small differential voltage across inputs and verify amplification.',
        components: [
            { componentName: 'Operational Amplifier IC 741', partNumber: 'IC-LM741', quantity: 3, notes: 'Input buffers and differential stage' },
            { componentName: 'Matched Resistors (10k, 100k Ohm, 0.1% tolerance)', partNumber: 'RES-MATCH-10K', quantity: 7, notes: 'Bridge and gain setting' },
            { componentName: 'DC Differential Calibration Source', partNumber: 'EQP-DIFF-CAL', quantity: 1, notes: 'Precision millivolt source' }
        ],
        questions: [
            {
                questionText: 'Why is an Instrumentation Amplifier preferred over a standard differential op-amp for transducer interfacing?',
                options: ['Extremely high input impedance on both terminals and superior CMRR', 'Lower DC operating voltage', 'Built-in ADC conversion', 'Inversion of noise signals'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In a standard 3-op-amp instrumentation amplifier, how is the overall voltage gain primarily set?',
                options: ['By adjusting a single external resistor Rg', 'By changing VCC voltage', 'By altering capacitor values', 'By switching input terminals'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What does a Common Mode Rejection Ratio (CMRR) of 100 dB indicate?',
                options: ['The circuit amplifies differential signals 100,000 times more than common-mode noise', '100 Watts output power', 'Total noise power is 100 dBm', 'Bandwidth is 100 kHz'],
                correctOptionIndex: 0
            },
            {
                questionText: 'The input buffer stage of an instrumentation amplifier provides a common-mode voltage gain of:',
                options: ['Unity (Ac1 = 1)', 'Zero', 'Infinite', 'Negative 10'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 5,
        title: 'Design and Implementation of Half & Full Adder and Subtractor',
        aim: 'To construct and verify the truth tables of Half Adder, Full Adder, Half Subtractor, and Full Subtractor using basic logic gates.',
        description: 'Adders and subtractors are fundamental arithmetic circuits in ALUs. A Half Adder produces Sum = A XOR B and Carry = A AND B. A Full Adder adds three binary digits producing Sum = A XOR B XOR Cin and Cout = AB + Cin(A XOR B).',
        objectives: [
            'Construct Half Adder using XOR and AND gates',
            'Construct Full Adder using two Half Adders and an OR gate',
            'Construct Half Subtractor and Full Subtractor and tabulate truth tables'
        ],
        instructions: '1. Mount IC 7486 (XOR), IC 7408 (AND), and IC 7432 (OR) on digital trainer. 2. Connect inputs to logic switches and outputs to status LEDs. 3. Step through all 8 binary input combinations and record Sum and Carry.',
        components: [
            { componentName: 'IC 7486 Quad 2-Input XOR Gate', partNumber: 'IC-7486', quantity: 1, notes: 'TTL DIP-14' },
            { componentName: 'IC 7408 Quad 2-Input AND Gate', partNumber: 'IC-7408', quantity: 1, notes: 'TTL DIP-14' },
            { componentName: 'IC 7432 Quad 2-Input OR Gate', partNumber: 'IC-7432', quantity: 1, notes: 'TTL DIP-14' },
            { componentName: 'IC 7404 Hex Inverter (NOT Gate)', partNumber: 'IC-7404', quantity: 1, notes: 'Subtractor borrows' },
            { componentName: 'Digital IC Logic Trainer Kit with LEDs', partNumber: 'KIT-LOGIC-01', quantity: 1, notes: '5V DC power and logic switches' }
        ],
        questions: [
            {
                questionText: 'What is the Boolean expression for the Sum output of a Full Adder with inputs A, B, and Cin?',
                options: ['A XOR B XOR Cin', 'A AND B AND Cin', '(A + B) . Cin', 'A\'B + AB\''],
                correctOptionIndex: 0
            },
            {
                questionText: 'In a Half Subtractor, the Difference (D) and Borrow (B) expressions for inputs A and B are:',
                options: ['D = A XOR B, Borrow = A\' . B', 'D = A AND B, Borrow = A + B', 'D = A + B, Borrow = A . B', 'D = (A XOR B)\', Borrow = A . B\''],
                correctOptionIndex: 0
            },
            {
                questionText: 'How many Half Adders and OR gates are required to construct a single-bit Full Adder?',
                options: ['2 Half Adders and 1 OR gate', '1 Half Adder and 2 OR gates', '4 Half Adders only', '3 XOR gates only'],
                correctOptionIndex: 0
            },
            {
                questionText: 'When adding inputs A=1, B=1, Cin=1 in a Full Adder, what are the outputs Sum and Carry?',
                options: ['Sum = 1, Carry = 1', 'Sum = 0, Carry = 1', 'Sum = 1, Carry = 0', 'Sum = 0, Carry = 0'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 6,
        title: 'Design of 4-Bit Binary Adder/Subtractor and BCD Adder',
        aim: 'To design and implement a 4-bit parallel binary adder/subtractor using IC 7483 and XOR gates, and implement BCD addition with tens-carry detection.',
        description: 'Using IC 7483 4-bit binary adder with controlled XOR inverters, addition is performed when Mode M=0, and subtraction is performed via 2s complement when M=1. BCD adders add binary 0110 (6) whenever sum exceeds 9 or produces carry.',
        objectives: [
            'Implement 4-bit addition and 2s complement subtraction with IC 7483',
            'Verify overflow and end-around carry status',
            'Construct BCD correction logic using AND/OR gates and secondary adder'
        ],
        instructions: '1. Connect IC 7483 4-bit adder with IC 7486 XOR gates controlled by Mode line M. 2. Test 4-bit addition with inputs A=0101 and B=0011 (Sum=1000). 3. Switch M=1 and verify binary subtraction. 4. Connect BCD correction detection circuit.',
        components: [
            { componentName: 'IC 7483 4-Bit Parallel Binary Adder', partNumber: 'IC-7483', quantity: 2, notes: 'High speed arithmetic adder' },
            { componentName: 'IC 7486 Quad XOR Gate', partNumber: 'IC-7486', quantity: 1, notes: 'Controlled inverter' },
            { componentName: 'IC 7408 AND / IC 7432 OR Gates', partNumber: 'IC-GATES-SET', quantity: 2, notes: 'BCD correction circuit' },
            { componentName: 'Digital Logic Trainer Board', partNumber: 'KIT-LOGIC-01', quantity: 1, notes: 'Binary switches and indicators' }
        ],
        questions: [
            {
                questionText: 'Why are XOR gates used at the inputs of IC 7483 for 2s complement binary subtraction?',
                options: ['They act as controlled inverters: when Mode M=1, they invert bits and M provides Cin=+1', 'They double the clock speed', 'They prevent carry propagation', 'They convert TTL logic to CMOS'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In BCD addition, what correction value must be added to a decade sum if the result exceeds 9 or generates a carry?',
                options: ['Binary 0110 (Decimal 6)', 'Binary 0010 (Decimal 2)', 'Binary 1000 (Decimal 8)', 'Binary 1010 (Decimal 10)'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the Boolean condition to detect when a 4-bit binary sum (S3, S2, S1, S0) exceeds decimal 9?',
                options: ['Cout + (S3 . S2) + (S3 . S1)', 'S3 . S0 only', 'S2 + S1 + S0', 'Cout AND S0'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the propagation delay limitation of standard ripple carry adders like IC 7483?',
                options: ['Carry must ripple through all 4 bit stages sequentially', 'Cannot add signed numbers', 'Consumes infinite current', 'Output is inverted'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 7,
        title: 'Implementation of Shift Registers using Flip-Flops',
        aim: 'To design and study 4-bit shift registers: Serial-In Serial-Out (SISO), Serial-In Parallel-Out (SIPO), Parallel-In Serial-Out (PISO), and Parallel-In Parallel-Out (PIPO) using IC 7474.',
        description: 'Shift registers consist of cascaded flip-flops sharing a common clock line. Data bits shift one position per clock transition, enabling serial-to-parallel conversion, parallel-to-serial conversion, and digital data storage.',
        objectives: [
            'Construct 4-bit shift register using D flip-flops (IC 7474)',
            'Demonstrate serial loading and parallel readout after 4 clock pulses',
            'Observe Ring Counter and Johnson Twisted-Ring Counter sequences'
        ],
        instructions: '1. Connect two IC 7474 dual D flip-flops in cascade with Q outputs tied to D inputs. 2. Connect common clock to manual pulser. 3. Apply serial data sequence (1-0-1-1) and observe bit progression on LED indicators.',
        components: [
            { componentName: 'IC 7474 Dual D-Type Flip-Flop', partNumber: 'IC-7474', quantity: 2, notes: 'Positive-edge triggered DIP-14' },
            { componentName: 'IC 7495 4-Bit Universal Shift Register (Optional)', partNumber: 'IC-7495', quantity: 1, notes: 'Universal shift IC' },
            { componentName: 'Single Pulse Manual Clock Generator & LEDs', partNumber: 'KIT-PULSER-01', quantity: 1, notes: 'Debounced clock pulser' }
        ],
        questions: [
            {
                questionText: 'In a 4-bit Serial-In Serial-Out (SISO) shift register, how many clock pulses are needed to completely shift 4 bits in and out?',
                options: ['4 clock pulses to enter, 4 clock pulses to exit (total 7-8 pulses)', '1 clock pulse', '16 clock pulses', 'Zero clock pulses'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In a Serial-In Parallel-Out (SIPO) register, all 4 bits become available simultaneously after:',
                options: ['4 clock cycles', '1 clock cycle', '8 clock cycles', 'Zero clock cycles'],
                correctOptionIndex: 0
            },
            {
                questionText: 'A 4-bit Johnson (twisted-ring) counter constructed from shift registers has how many unique decoded states?',
                options: ['8 states (2 * n)', '4 states (n)', '16 states (2^n)', '2 states'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Which type of flip-flop is most commonly employed inside synchronous shift registers?',
                options: ['D (Data) Flip-Flop', 'T (Toggle) Flip-Flop only', 'SR Latch only', 'Monostable multivibrator'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 8,
        title: 'Design and Implementation of Encoder and Decoder',
        aim: 'To design and implement an 8-to-3 binary Priority Encoder using IC 74148 and a 3-to-8 line Decoder / Demultiplexer using IC 74138.',
        description: 'An encoder converts 2^n active input lines into an n-bit binary code (with priority handling for simultaneous inputs). A decoder performs the inverse operation, decoding an n-bit binary address to selectively activate one of 2^n output lines.',
        objectives: [
            'Verify priority encoding operation with active-low inputs on IC 74148',
            'Verify 3-to-8 line decoding and chip enable control on IC 74138',
            'Construct binary to seven-segment display decoding interface'
        ],
        instructions: '1. Wire IC 74148 with inputs tied to active-low pushbuttons. 2. Verify priority resolution when multiple inputs are pressed. 3. Connect binary output to IC 74138 decoder and verify corresponding single active output line.',
        components: [
            { componentName: 'IC 74148 8-to-3 Line Priority Encoder', partNumber: 'IC-74148', quantity: 1, notes: 'Active-low priority encoder' },
            { componentName: 'IC 74138 3-to-8 Line Decoder/Demultiplexer', partNumber: 'IC-74138', quantity: 1, notes: 'Active-low outputs' },
            { componentName: 'Digital IC Trainer with Pushbuttons and LEDs', partNumber: 'KIT-LOGIC-01', quantity: 1, notes: 'Input/output testing' }
        ],
        questions: [
            {
                questionText: 'What is the main distinction between a standard binary encoder and a Priority Encoder?',
                options: ['When multiple inputs are active simultaneously, the priority encoder outputs the code of the highest-order active input', 'The priority encoder consumes zero power', 'The priority encoder cannot handle binary digits', 'A priority encoder requires clock pulses'],
                correctOptionIndex: 0
            },
            {
                questionText: 'How many inputs and outputs are present in an 8-to-3 line priority encoder?',
                options: ['8 inputs and 3 binary outputs', '3 inputs and 8 outputs', '8 inputs and 8 outputs', '4 inputs and 2 outputs'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In IC 74138 (3-to-8 line decoder), what logic level is produced on the selected decoded output pin?',
                options: ['Active Low (Logic 0 on selected line, Logic 1 on all others)', 'Active High (Logic 1)', 'High impedance (floating)', 'Oscillating pulse'],
                correctOptionIndex: 0
            },
            {
                questionText: 'A 3-to-8 decoder with enable input can also be utilized as a:',
                options: ['1-to-8 Demultiplexer (DEMUX)', 'Multiplexer (MUX)', 'Shift Register', 'Full Adder only'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 9,
        title: 'Design of Clipper Circuits using Diode',
        aim: 'To design, construct, and observe the waveform shaping characteristics of positive, negative, biased, and combination diode clipper circuits.',
        description: 'Clipper circuits use diodes and DC bias sources to truncate or clip input AC voltage waveforms above or below predetermined reference levels without distorting the remaining segment of the signal.',
        objectives: [
            'Construct positive shunt and series diode clippers',
            'Construct biased clippers with variable DC reference voltages',
            'Construct double-ended combination clippers and compare input vs output on DSO'
        ],
        instructions: '1. Wire silicon diode 1N4007 with resistor R=1k and variable DC bias supply. 2. Apply 10V peak-to-peak 1kHz sine wave from function generator. 3. Observe clipping action on DSO and measure threshold voltage Vgamma approx 0.7V.',
        components: [
            { componentName: 'Semiconductor Diodes 1N4007', partNumber: 'DIO-1N4007', quantity: 2, notes: 'Silicon rectifier diode' },
            { componentName: 'Carbon Film Resistors (1k, 4.7k, 10k Ohm)', partNumber: 'RES-ASSORTED', quantity: 4, notes: 'Current limiting' },
            { componentName: 'Variable DC Bias Voltage Source (0-30V)', partNumber: 'EQP-RPS-01', quantity: 1, notes: 'Clipping threshold bias' },
            { componentName: 'Function Generator & Dual Trace Oscilloscope', partNumber: 'EQP-FG-DSO', quantity: 1, notes: 'AC input & waveform viewing' }
        ],
        questions: [
            {
                questionText: 'In an unbiased positive shunt clipper circuit, what happens to the output waveform during positive half cycles?',
                options: ['The diode conducts and clips the waveform to the diode forward drop (+0.7V for silicon)', 'The negative half cycle is clipped', 'The entire signal is amplified', 'The signal frequency is doubled'],
                correctOptionIndex: 0
            },
            {
                questionText: 'If a positive shunt clipper has a DC bias voltage of +3V in series with the diode, at what level is the waveform clipped?',
                options: ['+3.7V (Vbias + Vgamma)', '+3.0V exactly', '+0.7V', '-3.0V'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Why is a series resistor R necessary in diode shunt clipper circuits?',
                options: ['To drop excess voltage when the diode conducts and prevent short-circuiting the source', 'To provide negative feedback', 'To discharge capacitors', 'To increase signal frequency'],
                correctOptionIndex: 0
            },
            {
                questionText: 'A combination clipper containing two back-to-back biased diodes is typically used as a:',
                options: ['Square wave generator or voltage limiter from sine wave', 'Frequency multiplier', 'DC power converter', 'Audio mixer'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 10,
        title: 'Design of Clamper Circuit using Diode',
        aim: 'To design, construct, and observe positive and negative diode clamper circuits and measure the resulting DC level shift.',
        description: 'Clamper circuits (DC restorers) utilize a capacitor, diode, and load resistor to shift the entire AC input waveform either upwards (positive clamp) or downwards (negative clamp) such that either the negative or positive peak touches the reference voltage.',
        objectives: [
            'Construct positive clamper and observe upward DC shift by Vpeak',
            'Construct negative clamper and observe downward DC shift by Vpeak',
            'Verify condition 5 * R * C >> T (time period of input signal) for undistorted clamping'
        ],
        instructions: '1. Connect capacitor C=0.1uF, diode 1N4007, and load resistor R=100k. 2. Apply 5V peak 1kHz sine wave. 3. Set oscilloscope to DC coupling mode to observe true DC level displacement. 4. Verify output peak-to-peak amplitude remains equal to input (Vpp_out = Vpp_in).',
        components: [
            { componentName: 'Semiconductor Diode 1N4007', partNumber: 'DIO-1N4007', quantity: 1, notes: 'Clamping diode' },
            { componentName: 'Electrolytic / Polyester Capacitor (0.1uF, 1uF)', partNumber: 'CAP-CLAMP-SET', quantity: 2, notes: 'DC storage capacitor' },
            { componentName: 'Load Resistors (10k, 100k Ohm)', partNumber: 'RES-ASSORTED', quantity: 4, notes: 'RC discharge constant' },
            { componentName: 'Function Generator & DSO (DC Coupling)', partNumber: 'EQP-FG-DSO', quantity: 1, notes: 'Observation of DC shift' }
        ],
        questions: [
            {
                questionText: 'What fundamental property distinguishes a clamper circuit from a clipper circuit?',
                options: ['A clamper shifts the DC level of the entire signal without clipping or altering its peak-to-peak waveform shape', 'A clamper clips the peaks', 'A clamper inverts signal phase by 180 degrees', 'A clamper operates only on DC voltages'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Why must oscilloscope input coupling be set to "DC" mode when observing clamper circuits?',
                options: ['"AC" mode blocks the DC component and would center the waveform, hiding the clamping shift', '"DC" mode amplifies the signal', '"AC" mode causes diode burnout', '"DC" mode provides trigger lock'],
                correctOptionIndex: 0
            },
            {
                questionText: 'For satisfactory clamping without waveform tilt or distortion, the discharge time constant RC must satisfy:',
                options: ['R * C >> T (much greater than input signal period T)', 'R * C << T', 'R * C = 0', 'R * C = T / 10'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In an unbiased positive clamper with a 10V peak-to-peak sine wave (-5V to +5V), the output waveform swings approximately between:',
                options: ['0V and +10V (shifted completely above ground)', '-10V and 0V', '-5V and +5V unchanged', '-0.7V and +0.7V'],
                correctOptionIndex: 0
            }
        ]
    }
];

// Knowledge Base for Robotics & Automation Laboratory Curriculum
const ROBOTICS_EXPERIMENTS = [
    {
        num: 1,
        title: 'Study of Robotic Manipulators, Coordinate Systems and Degrees of Freedom (DOF)',
        aim: 'To understand the anatomical structure, kinematic joint classifications (revolute, prismatic), coordinate frames (Cartesian, Cylindrical, Spherical, Articulated), and degrees of freedom of robotic arm systems.',
        description: 'Examines robotic arm configurations, joint-link relationships, coordinate transformations, and workspace volume envelope. Verifies joint limits and establishes base, elbow, wrist, and tool center point (TCP) coordinate frames.',
        objectives: [
            'Identify revolute and prismatic joints in robotic manipulator arm',
            'Compute total degree of freedom using Grubler-Kutzbach mobility criterion',
            'Map the 3D reachable and dexterous workspace volume',
            'Establish home calibration position and zero-reference frames'
        ],
        instructions: '1. Power on the 4-DOF articulated robotic arm trainer using regulated 5V DC supply. 2. Verify joint zero offsets using controller calibration software. 3. Sequentially articulate base (waist), shoulder, elbow, and wrist joints to record angular ranges. 4. Measure reachable radius and calculate total 3D spherical workspace.',
        components: [
            { componentName: '4-DOF Articulated Robotic Arm Trainer Kit', partNumber: 'ROB-ARM-4DOF', quantity: 1, notes: 'Anodized aluminum frame with gripper' },
            { componentName: 'High Torque Metal Gear Servo Motors (MG995)', partNumber: 'ACT-SERVO-MG995', quantity: 4, notes: '10 kg-cm stall torque joint actuators' },
            { componentName: 'Microcontroller Master Board (Arduino Mega 2560)', partNumber: 'CTL-ARD-MEGA2560', quantity: 1, notes: 'Multi-channel PWM actuator driver' },
            { componentName: 'Regulated DC Power Supply (5V, 5A)', partNumber: 'EQP-RPS-5V5A', quantity: 1, notes: 'Dedicated high-current servo power rail' },
            { componentName: 'Precision Rotary Angle Measurement Grid', partNumber: 'TLS-ROT-GRID', quantity: 1, notes: 'Joint coordinate calibration scale' }
        ],
        questions: [
            {
                questionText: 'What constitutes a single Degree of Freedom (DOF) in a robotic manipulator mechanism?',
                options: ['An independent joint variable or coordinate needed to define kinematic position', 'The maximum speed of the arm in meters per second', 'The weight of the end-effector payload', 'The total number of microcontrollers used'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In a spatial 3D robot, how many degrees of freedom are fundamentally required for arbitrary position and orientation of the end-effector?',
                options: ['6 Degrees of Freedom (3 Position + 3 Orientation)', '3 Degrees of Freedom', '4 Degrees of Freedom', '12 Degrees of Freedom'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Which coordinate configuration provides a revolute base joint with two revolute arm joints mimicking a human arm?',
                options: ['Articulated / Jointed-Arm Configuration (RRR)', 'Cartesian / Gantry Configuration (PPP)', 'Cylindrical Configuration (RPP)', 'SCARA Configuration (RRP)'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Why must servo motor actuators in a robotic arm have a separate high-current DC power supply rather than microcontroller USB power?',
                options: ['Servos draw high inductive stall currents that cause microcontroller brownout resets', 'Microcontroller signals are AC voltage only', 'USB cables can only supply high frequency RF signals', 'Separate power supply reverses motor direction'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 2,
        title: 'Forward and Inverse Kinematics Analysis of 2-DOF and 3-DOF Planar Manipulator',
        aim: 'To formulate Denavit-Hartenberg (D-H) parameter matrices, derive forward kinematics equations to find end-effector position (x, y), and solve inverse kinematics for required joint angles (theta1, theta2).',
        description: 'Implements forward kinematics using homogenous transformation matrices T = A1 * A2. Calculates end-effector Cartesian coordinates from link lengths L1, L2 and joint angles. Solves geometric inverse kinematics providing elbow-up and elbow-down configurations.',
        objectives: [
            'Assign Denavit-Hartenberg (D-H) coordinate frames according to standard rules',
            'Compute forward kinematics transformation matrices using trigonometric relations',
            'Solve inverse kinematics using law of cosines and geometric trigonometric relations',
            'Detect and characterize kinematic workspace boundary singularities'
        ],
        instructions: '1. Position the 2-link planar arm with link lengths L1=150mm, L2=100mm. 2. Input joint angles theta1=30 deg, theta2=45 deg into the kinematics controller. 3. Record measured end-effector (X, Y) coordinates and compare with analytical D-H equations. 4. Input target (X, Y) coordinate and calculate required dual inverse kinematics joint solutions.',
        components: [
            { componentName: 'Planar 2-DOF Kinematic Linkage Mechanism', partNumber: 'ROB-LINK-2DOF', quantity: 1, notes: 'Precision dual-link planar testbed' },
            { componentName: 'Optical Quadrature Rotary Encoders', partNumber: 'SEN-ENC-OPT600', quantity: 2, notes: '600 PPR joint angular feedback' },
            { componentName: 'Microcontroller Kinematics Unit', partNumber: 'CTL-MCU-CORE', quantity: 1, notes: 'Real-time D-H matrix computer' },
            { componentName: 'Cartesian Coordinate Calibrated Plotting Mat', partNumber: 'TLS-GRID-MM', quantity: 1, notes: 'Millimeter grid coordinate verification' }
        ],
        questions: [
            {
                questionText: 'What is the primary purpose of the Denavit-Hartenberg (D-H) convention in robot kinematics?',
                options: ['To systematically attach coordinate frames to links and compute forward kinematics', 'To calculate the motor winding temperature', 'To optimize battery power consumption', 'To compress camera image files'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In inverse kinematics for an articulated planar arm, what does finding multiple mathematical solutions physically represent?',
                options: ['Multiple arm postures reaching the same TCP point (e.g. Elbow-Up vs Elbow-Down)', 'A computational algorithm error', 'Motor stator overheating', 'Encoder wire disconnection'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What occurs at a kinematic singularity point in a robotic manipulator?',
                options: ['The manipulator loses one or more degrees of freedom and Jacobian determinant equals zero', 'Motor speed becomes zero permanently', 'The end-effector changes color', 'DC voltage doubles instantaneously'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In a 2-link planar arm with link lengths L1 and L2, what is the maximum reachable boundary coordinate distance from the base origin?',
                options: ['L1 + L2 (fully extended arm collinear posture)', 'L1 - L2', 'Square root of (L1^2 + L2^2)', '2 * (L1 * L2)'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 3,
        title: 'Pick and Place Operations using Robotic End-Effector Gripper',
        aim: 'To program an automated pick-and-place task cycle involving path trajectory generation, pneumatic/servo gripper actuation, and part transfer between designated work stations.',
        description: 'Covers trajectory synthesis, approach vector, orientation alignment, gripper grasping force timing, lift sequence, transfer motion, place release, and retreat trajectory to ensure reliable manufacturing automation.',
        objectives: [
            'Program waypoint trajectory coordinates for pick, transfer, and place positions',
            'Synchronize end-effector servo gripper grasping action with arm dwell timing',
            'Optimize cycle execution time and prevent target workpiece slippage',
            'Incorporate interlock safety signals prior to gripper actuation'
        ],
        instructions: '1. Teach pick location coordinates (X1, Y1, Z1) and drop location coordinates (X2, Y2, Z2). 2. Configure gripper opening width (45mm) and grasping tension. 3. Execute automated continuous cycle test for 10 consecutive pick-and-place cycles. 4. Verify repeatability accuracy and cycle time using stopwatch.',
        components: [
            { componentName: 'Articulated Robotic Arm with Mechanical Gripper', partNumber: 'ROB-ARM-GRIP', quantity: 1, notes: 'Parallel jaw servo end-effector' },
            { componentName: 'Micro Servo Motor (SG90)', partNumber: 'ACT-SERVO-SG90', quantity: 1, notes: 'Gripper claw actuator' },
            { componentName: 'Infrared Proximity Object Detection Sensor', partNumber: 'SEN-IR-PROX', quantity: 2, notes: 'Object present verification' },
            { componentName: 'Industrial Sorting Pallet Matrix & Test Blocks', partNumber: 'ACC-PAL-MAT', quantity: 1, notes: 'Calibration acrylic test cubes' }
        ],
        questions: [
            {
                questionText: 'What is the definition of "Repeatability" in an industrial pick-and-place robot?',
                options: ['The ability of the robot to return to the exact same taught position over repeated cycles', 'The absolute maximum payload weight the arm can carry', 'The total electric current drawn per hour', 'The resolution of the camera sensor'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Why is an "approach trajectory" and "retreat trajectory" programmed above the pick location rather than moving directly horizontally?',
                options: ['To prevent collision with adjacent fixtures, bins, or neighboring parts', 'To increase motor temperature', 'To reset the microcontroller clock', 'To invert the servo motor polarity'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Which type of end-effector is most suitable for handling flat, non-porous sheet metal or glass panes without surface marring?',
                options: ['Vacuum suction cup end-effector', 'Two-jaw mechanical claw', 'Magnetic solenoid clamp on glass', 'Hook attachment'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In automated assembly lines, what sensor signal ensures a workpiece is successfully captured before lifting?',
                options: ['Grip verification sensor (optical / tactile force switch)', 'Motor temperature thermocouple', 'Ambient room thermometer', 'Microcontroller crystal oscillator'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 4,
        title: 'Autonomous Line Tracking and Path Following Mobile Robot',
        aim: 'To design, build, and evaluate an autonomous differential-drive mobile robot utilizing an infrared reflectance sensor array and closed-loop steering algorithm to navigate high-contrast path tracks.',
        description: 'Implements differential steering kinematics where robot linear velocity v = (vr + vl)/2 and rotational velocity omega = (vr - vl)/W. Uses TCRT5000 infrared reflectance sensors to detect dark track lines on light background and adjusts PWM motor drive speeds.',
        objectives: [
            'Assemble dual DC geared motors onto differential mobile chassis',
            'Calibrate infrared reflectance sensors for black line absorption versus white floor reflection',
            'Implement bang-bang and proportional steering control algorithms in firmware',
            'Achieve stable tracking around 90-degree corners and S-curves without track departure'
        ],
        instructions: '1. Mount 5-sensor IR tracking bar 10mm above the floor surface. 2. Calibrate analog comparator threshold for black line reflection. 3. Connect L298N motor driver to Arduino PWM output pins 5, 6, 9, 10. 4. Execute test runs on 25mm black track line and record lap completion times across proportional gain values.',
        components: [
            { componentName: 'Differential Drive Mobile Robot Chassis Kit', partNumber: 'ROB-MOB-2WD', quantity: 1, notes: 'Dual drive wheels and front caster' },
            { componentName: '5-Channel TCRT5000 IR Line Tracking Sensor Array', partNumber: 'SEN-IR-TCRT5000', quantity: 1, notes: 'Reflective optical sensor bar' },
            { componentName: 'L298N Dual H-Bridge Motor Driver Module', partNumber: 'DRV-HBRG-L298N', quantity: 1, notes: '2A dual DC motor driver' },
            { componentName: 'High Torque DC Geared Motors (300 RPM)', partNumber: 'ACT-MTR-DC300', quantity: 2, notes: '6V DC motors with rubber tires' },
            { componentName: 'Rechargeable Li-Ion Battery Pack (7.4V / 2200mAh)', partNumber: 'PWR-BATT-LION', quantity: 1, notes: 'Mobile onboard power pack' }
        ],
        questions: [
            {
                questionText: 'How does an infrared reflectance sensor (TCRT5000) distinguish a black line from a white floor surface?',
                options: ['Black surfaces absorb infrared light resulting in low phototransistor conduction, while white surfaces reflect IR', 'Black surfaces reflect more light than white', 'Black surfaces emit ultrasound signals', 'White surfaces absorb all electromagnetic frequencies'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In a differential drive mobile robot, how is an in-place zero-radius pivot turn executed?',
                options: ['Left wheel rotates backwards while right wheel rotates forward at identical speeds', 'Both wheels turn in the forward direction at maximum speed', 'Both wheels remain locked and stationary', 'The front caster wheel is steered by a servo motor'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the primary role of an H-Bridge motor driver circuit (e.g. L298N)?',
                options: ['To provide bidirectional DC motor current control and speed control using PWM signals', 'To step down AC mains electricity to 5V', 'To generate audio signals for robot horn', 'To store program code in non-volatile memory'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Why is Proportional-Derivative (PD) control superior to basic on/off (bang-bang) control for mobile line tracking?',
                options: ['It minimizes oscillatory hunting (wobbling) across the track line for smoother high-speed travel', 'It completely drains battery power faster', 'It removes the need for infrared sensors', 'It doubles the robot physical chassis weight'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 5,
        title: 'Obstacle Detection and Collision Avoidance using Ultrasonic Sensor (HC-SR04)',
        aim: 'To integrate an HC-SR04 ultrasonic time-of-flight ranging sensor onto a pan-servo scanner to detect obstacles in real time and execute autonomous evasion maneuvers.',
        description: 'Transmits a 10 microsecond TTL trigger pulse generating eight 40 kHz ultrasonic bursts. Measures the duration of the return echo pulse. Computes distance d = (echo_duration * 340 m/s) / 2. Commands mobile platform to stop, scan left/right, and turn into the clear corridor.',
        objectives: [
            'Interface HC-SR04 Trigger and Echo pins with hardware microcontroller timer',
            'Derive target distance equation based on acoustic speed of sound in dry air',
            'Implement a forward sweep radar scanning routine using micro servo mount',
            'Develop reactive collision avoidance state machine (Stop -> Reverse -> Scan -> Steer)'
        ],
        instructions: '1. Mount HC-SR04 on SG90 servo motor centered at 90 degrees. 2. Connect Trigger to Digital Pin 7, Echo to Digital Pin 8. 3. Verify distance measurements from 5cm to 200cm against a tape measure with +/- 1cm accuracy. 4. Implement obstacle avoidance threshold at 25cm and verify obstacle avoidance in arena maze.',
        components: [
            { componentName: 'Ultrasonic Ranging Sensor Module (HC-SR04)', partNumber: 'SEN-US-HCSR04', quantity: 1, notes: '40 kHz acoustic transducer' },
            { componentName: 'Pan-Tilt / Scanner Micro Servo (SG90)', partNumber: 'ACT-SERVO-SG90', quantity: 1, notes: '180-degree radar sweep mount' },
            { componentName: 'Arduino Mobile Robot Controller', partNumber: 'CTL-ARD-UNO', quantity: 1, notes: 'Real-time microcontroller node' },
            { componentName: 'Audible Piezo Warning Buzzer & Indicator LEDs', partNumber: 'IND-PIEZO-LED', quantity: 1, notes: 'Proximity alarm feedback' }
        ],
        questions: [
            {
                questionText: 'In distance calculation with HC-SR04 ultrasonic sensor, why is the echo pulse travel time divided by 2?',
                options: ['The sound wave travels forward to the obstacle and reflects back, covering twice the distance', 'The microcontroller clock runs at double speed', 'Ultrasound waves travel twice as fast as light', 'To convert centimeters into inches'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the approximate speed of sound in air at room temperature (20 degrees Celsius)?',
                options: ['Approximately 343 meters per second (0.0343 cm/microsecond)', '300,000 kilometers per second', '100 meters per second', '1500 meters per second'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is a well-known limitation of ultrasonic sensors when detecting obstacles placed at sharp angles?',
                options: ['Specular reflection where acoustic sound bounces away from the sensor without returning to the receiver', 'The sensor detects thermal infrared radiation instead', 'Ultrasound cannot pass through vacuum or air', 'The sensor draws 50 Amperes of electrical current'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What minimum trigger pulse duration must be supplied to the HC-SR04 Trigger pin to initiate ultrasonic transmission?',
                options: ['10 microseconds high-level pulse', '1 second pulse', '50 milliseconds pulse', '100 nanoseconds pulse'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 6,
        title: 'Velocity and Position Control of DC Geared Motors with Optical Encoders',
        aim: 'To interface incremental quadrature optical encoders with hardware external interrupts to measure shaft rotation speed, decode direction of rotation, and implement closed-loop PID velocity control.',
        description: 'Quadrature optical encoders generate two square-wave output signals (Channel A and Channel B) 90 degrees out of phase. Decodes phase relationship to determine clockwise or counter-clockwise rotation and counts edges to compute RPM and angular position.',
        objectives: [
            'Wire quadrature encoder Channels A & B to microcontroller interrupt pins INT0 and INT1',
            'Implement 4X quadrature edge decoding in firmware interrupt service routines (ISR)',
            'Measure motor RPM across varying PWM duty cycle percentages (20% to 100%)',
            'Construct closed-loop velocity regulation maintaining constant RPM under mechanical load'
        ],
        instructions: '1. Connect 12V DC motor with built-in Hall/optical encoder to L298N driver and 12V bench supply. 2. Connect encoder Channel A to pin 2 and Channel B to pin 3. 3. Observe 90-degree phase shift on dual-channel DSO. 4. Apply mechanical brake load and observe PID loop restoring target RPM within 200ms.',
        components: [
            { componentName: '12V DC Geared Motor with Integrated Quadrature Encoder', partNumber: 'ACT-MTR-ENC12V', quantity: 1, notes: 'Metal gearbox with 11 PPR encoder' },
            { componentName: 'Dual H-Bridge Motor Driver Module (L298N)', partNumber: 'DRV-HBRG-L298N', quantity: 1, notes: 'Motor power interface' },
            { componentName: 'Digital Storage Oscilloscope (DSO 0-20MHz)', partNumber: 'EQP-DSO-100MHZ', quantity: 1, notes: 'Phase A & B waveform observation' },
            { componentName: 'Digital Optical Tachometer', partNumber: 'TLS-OPT-TACH', quantity: 1, notes: 'Independent RPM verification' },
            { componentName: 'Regulated Dual DC Power Supply (12V / 5V)', partNumber: 'EQP-RPS-DUAL', quantity: 1, notes: 'Motor and logic rails' }
        ],
        questions: [
            {
                questionText: 'What is the characteristic phase difference between Channel A and Channel B in a quadrature incremental encoder?',
                options: ['90 degrees electrical phase difference (in quadrature)', '180 degrees phase difference', '0 degrees (in-phase)', '45 degrees phase difference'],
                correctOptionIndex: 0
            },
            {
                questionText: 'How is the direction of motor shaft rotation determined using quadrature encoder signals?',
                options: ['By inspecting whether Channel A leads or lags Channel B at each transition edge', 'By measuring the DC amplitude voltage of Channel A', 'By the physical color of the encoder wires', 'By counting the number of ground wires connected'],
                correctOptionIndex: 0
            },
            {
                questionText: 'If a motor encoder outputs 11 pulses per revolution (PPR) and has a 34:1 gear reduction ratio, what is the total counts per revolution of the output shaft in 4X decoding mode?',
                options: ['11 * 34 * 4 = 1,496 counts per output shaft revolution', '11 * 34 = 374 counts', '44 counts', '11 counts'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the primary function of Pulse Width Modulation (PWM) in DC motor speed control?',
                options: ['Controlling average voltage and power delivered to the motor by varying the pulse duty cycle', 'Changing the AC mains frequency', 'Reversing the magnetic poles of the encoder magnet', 'Measuring the temperature of the motor windings'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 7,
        title: 'Closed-Loop Trajectory Planning and Motion Control using PID Controller',
        aim: 'To tune Proportional-Integral-Derivative (PID) control parameters (Kp, Ki, Kd) for robotic joint positioning to achieve minimum settling time, zero steady-state error, and critically damped transient response.',
        description: 'Analyzes closed-loop feedback loop where error e(t) = Setpoint(t) - Position(t). Computes control output u(t) = Kp * e(t) + Ki * integral(e dt) + Kd * (de/dt). Evaluates effect of each term on rise time, overshoot, oscillation, and steady-state error.',
        objectives: [
            'Assemble precision servo position testbed with analog feedback potentiometer',
            'Record step response curves for purely proportional gain Kp (observing steady-state droop)',
            'Add integral gain Ki to eliminate steady-state position offset',
            'Tune derivative gain Kd to suppress transient overshoot and damp oscillations'
        ],
        instructions: '1. Connect motorized position testbed to PID controller interface. 2. Apply 90-degree step reference command. 3. Increase Kp until continuous oscillation is observed (Ultimate Gain Ku). 4. Use Ziegler-Nichols tuning formulas to establish baseline Kp, Ki, Kd parameters. 5. Log position response curves on PC oscilloscope.',
        components: [
            { componentName: 'Precision Closed-Loop Servo Positioning Testbed', partNumber: 'SYS-SERVO-PID', quantity: 1, notes: 'Motor, gearbox, and feedback potentiometer' },
            { componentName: 'PID Controller DAQ Acquisition Board', partNumber: 'DAQ-PID-USB', quantity: 1, notes: 'Real-time control interface' },
            { componentName: 'Dual Channel Storage Oscilloscope with PC USB Logging', partNumber: 'EQP-DSO-LOG', quantity: 1, notes: 'Step response recording' },
            { componentName: 'Precision Multi-Turn Feedback Potentiometer (10k)', partNumber: 'SEN-POT-10TURN', quantity: 1, notes: 'Joint position sensor' }
        ],
        questions: [
            {
                questionText: 'In a PID controller, which term is specifically responsible for eliminating permanent steady-state error (offset)?',
                options: ['Integral term (Ki * integral(e dt))', 'Proportional term only (Kp)', 'Derivative term only (Kd)', 'Feedforward bias term'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What undesirable effect occurs if the Derivative gain (Kd) in a PID loop is set excessively high?',
                options: ['High-frequency noise amplification leading to actuator jitter and mechanical wear', 'The motor stops permanently', 'Steady-state error increases to infinity', 'The system clock runs backwards'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the effect of increasing the Proportional gain (Kp) on closed-loop step response rise time and overshoot?',
                options: ['Decreases rise time (faster response) but increases overshoot and oscillatory ringing', 'Increases rise time and eliminates all overshoot', 'Has zero effect on rise time', 'Eliminates motor current completely'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In Ziegler-Nichols closed-loop tuning, what does the "Ultimate Period" (Tu) represent?',
                options: ['The period of sustained steady oscillations when proportional gain reaches its ultimate limit Ku', 'The total duration of the lab session in minutes', 'The time taken to discharge the power supply capacitors', 'The time to compile the microcontroller code'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 8,
        title: 'Vision-Based Color and Shape Object Detection for Robotic Sorting',
        aim: 'To interface an optical vision camera with an image processing module to detect target workpieces by color and shape in real time, extract centroid coordinates, and trigger robotic sorting actuation.',
        description: 'Implements computer vision pipeline: image acquisition, color space conversion (RGB to HSV), color threshold masking, morphological filtering (erosion/dilation), contour extraction, bounding box computation, and centroid calculation (Cx, Cy) for visual servoing.',
        objectives: [
            'Capture video frames from USB inspection camera at 30 FPS',
            'Convert camera frames from RGB to HSV color space for robust illumination-independent thresholding',
            'Apply morphology operations to remove speckle noise and bridge contour gaps',
            'Transmit centroid coordinate packets via serial UART to robotic pick-and-place arm'
        ],
        instructions: '1. Position high-definition USB camera 300mm directly above inspection conveyor. 2. Calibrate Hue, Saturation, Value (HSV) sliders for target red, green, and blue workpieces. 3. Place test workpieces on conveyor and verify centroid coordinate tracking with < 2mm error. 4. Verify automated robotic pick trigger upon workpiece entry into the pick zone.',
        components: [
            { componentName: 'High Definition Wide-Angle USB Machine Vision Camera', partNumber: 'SEN-CAM-HDUSB', quantity: 1, notes: '1080p 30 FPS fixed focus lens' },
            { componentName: 'Robotic Inspection Conveyor with DC Variable Drive', partNumber: 'EQP-CNV-MINI', quantity: 1, notes: 'Automated workpiece transport' },
            { componentName: 'Diffused Circular LED Ring Illuminator', partNumber: 'OPT-LED-RING', quantity: 1, notes: 'Even shadowless lighting' },
            { componentName: 'Color and Shape Geometric Calibration Test Cubes', partNumber: 'ACC-CAL-CUBES', quantity: 6, notes: 'Red, Green, Blue cylindrical/square parts' }
        ],
        questions: [
            {
                questionText: 'Why is the HSV (Hue, Saturation, Value) color space preferred over RGB in robotic machine vision for color segmentation?',
                options: ['HSV separates chromatic color information (Hue) from lighting intensity (Value), making it robust to ambient shadows', 'HSV requires half as many memory bytes as RGB', 'RGB cameras cannot capture color images', 'HSV images can only be displayed in black and white'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What image processing morphological operation is used to eliminate small foreground salt noise speckles?',
                options: ['Opening operation (Erosion followed by Dilation)', 'Brightness multiplication', 'Histogram equalization', 'Image sharpening convolution'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In image moment calculations, what do spatial moments (m00, m10, m01) provide?',
                options: ['Centroid coordinates Cx = m10 / m00 and Cy = m01 / m00 of the target blob', 'The frame rate of the camera in frames per second', 'The focal length of the optical glass lens', 'The temperature of the image sensor silicon die'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is "Eye-in-Hand" camera configuration in robotics?',
                options: ['Mounting the vision camera directly on the robot end-effector or wrist', 'Mounting the camera on the room ceiling looking down at the workspace', 'Having two human operators observe the robot', 'Placing optical sensors inside the servo motor gearbox'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 9,
        title: 'Stepper Motor Microstepping and Multi-Axis CNC Motion Control',
        aim: 'To drive a bipolar NEMA 17 hybrid stepper motor using an A4988/TMC2208 microstepping driver, observe current chopping waveforms, and implement coordinated multi-axis interpolation profiles.',
        description: 'Covers stepper motor stator phase excitation (full-step, half-step, quarter-step, and 1/16 microstep). Microstepping synthesizes sinusoidal phase currents in coils A and B, minimizing torque ripple, acoustic resonance, and step overshoot for precision positioning.',
        objectives: [
            'Configure microstep selection pins (MS1, MS2, MS3) for full-step through 1/16 microstepping',
            'Adjust driver current limit reference voltage (Vref) to match motor rated current',
            'Program linear acceleration and deceleration S-curve velocity profiles',
            'Measure position resolution and verify zero accumulated step loss over 1000 step cycles'
        ],
        instructions: '1. Connect NEMA 17 bipolar stepper motor (1.8 deg/step) to A4988 driver module on breadboard. 2. Set driver Vref to 0.6V (for 1.2A motor rating). 3. Apply 1 kHz STEP clock pulses and observe motor rotation. 4. Switch from full-step to 1/16 microstepping and observe smooth rotation and silent acoustic operation on DSO.',
        components: [
            { componentName: 'NEMA 17 Bipolar Hybrid Stepper Motor (1.8 deg/step)', partNumber: 'ACT-STEP-NEMA17', quantity: 1, notes: '200 steps per revolution motor' },
            { componentName: 'A4988 / TMC2208 Microstepping Stepper Driver Module', partNumber: 'DRV-STEP-A4988', quantity: 1, notes: 'Translational microstepping IC' },
            { componentName: 'Digital Storage Oscilloscope with Current Clamp Probe', partNumber: 'EQP-DSO-100MHZ', quantity: 1, notes: 'Coil phase current waveform observation' },
            { componentName: '24V Regulated DC Bench Power Supply (3A)', partNumber: 'EQP-RPS-24V', quantity: 1, notes: 'Dedicated high voltage stepper rail' },
            { componentName: 'Dual Linear Slide CNC Axis Prototype Rig', partNumber: 'MCH-SLIDE-AXIS', quantity: 1, notes: 'Lead screw linear positioning stage' }
        ],
        questions: [
            {
                questionText: 'How many full steps per complete 360-degree revolution are required for a standard 1.8-degree hybrid stepper motor?',
                options: ['200 steps (360 degrees / 1.8 degrees per step)', '100 steps', '360 steps', '400 steps'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What is the primary advantage of Microstepping (e.g. 1/16 microstep) over full-step excitation in robotics and 3D printers?',
                options: ['Provides smoother low-speed rotation, eliminates mechanical resonance, and increases angular position resolution', 'Increases motor maximum speed by 100 times', 'Eliminates all heat dissipation in motor coils', 'Replaces the need for external DC power'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What control signals are required to interface an A4988 microstepping driver with a microcontroller?',
                options: ['STEP pulse input (frequency dictates speed) and DIRECTION logic level (CW/CCW)', 'Three-phase 415V AC sinusoidal signals', 'Analog audio frequency signal', 'USB Ethernet packets only'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What causes a stepper motor to "skip steps" or stall during high-acceleration trajectory motions?',
                options: ['Commanded acceleration exceeds available motor torque at that operational speed', 'Operating the motor in microstepping mode', 'Providing a clean regulated 24V supply', 'Setting the direction pin to logic LOW'],
                correctOptionIndex: 0
            }
        ]
    },
    {
        num: 10,
        title: 'Wireless Teleoperation of Robotic Vehicle via Bluetooth / Wi-Fi',
        aim: 'To develop a wireless telemetry and remote teleoperation control system for a 4WD robotic mobile vehicle using wireless transceiver modules (HC-05 / ESP32) with fail-safe packet watchdog protocols.',
        description: 'Covers serial packet framing: Header byte, Command ID, Left Motor Speed, Right Motor Speed, Checksum byte, and Footer. Evaluates latency, signal range, lost-packet timeout safety watchdog, and manual joystick teleoperation.',
        objectives: [
            'Configure serial baud rate (9600 / 115200 bps) and wireless pairing connection',
            'Design robust serial packet structure with parity or checksum error validation',
            'Implement safety communication watchdog timer halting vehicle if signal is lost for > 500ms',
            'Conduct open-field teleoperation testing and benchmark communication latency'
        ],
        instructions: '1. Pair HC-05 Bluetooth module with remote control terminal. 2. Program joystick controller to transmit formatted 6-byte drive packet at 50 Hz. 3. Verify vehicle directional movement (Forward, Reverse, Pivot Left, Pivot Right, Stop). 4. Simulate signal drop by powering down transmitter and verify automatic failsafe motor shutdown within 500ms.',
        components: [
            { componentName: '4WD Heavy Duty Mobile Robot Rover Platform', partNumber: 'ROB-MOB-4WD', quantity: 1, notes: '4 DC geared motors with high-grip all-terrain wheels' },
            { componentName: 'HC-05 Bluetooth Serial Module / ESP32 NodeMCU', partNumber: 'COM-WIFI-BT', quantity: 1, notes: '2.4 GHz wireless transceiver' },
            { componentName: 'Dual Analog Thumbstick Remote Teleoperation Unit', partNumber: 'CTL-JOY-REMOTE', quantity: 1, notes: 'Operator command terminal' },
            { componentName: 'High-Current L298N / TB6612 Dual Motor Driver', partNumber: 'DRV-TB6612-MOD', quantity: 1, notes: '4-motor drive interface' },
            { componentName: '11.1V 3S LiPo Rechargeable Power Battery', partNumber: 'PWR-LIPO-3S', quantity: 1, notes: 'High discharge robotics battery pack' }
        ],
        questions: [
            {
                questionText: 'Why is an automatic communication "watchdog timer" essential in wireless teleoperated robotic systems?',
                options: ['To safely brake and halt the vehicle if wireless communication link is severed or disconnected', 'To measure the battery voltage level', 'To synchronize the robot video camera clock', 'To invert the steering wheels after every turn'],
                correctOptionIndex: 0
            },
            {
                questionText: 'In wireless serial packet transmission, what is the role of a Checksum byte at the end of each packet frame?',
                options: ['To allow the receiver to detect bit corruption or data errors caused by wireless RF noise', 'To power the receiver LED indicator', 'To double the wireless communication range', 'To convert digital signals into analog audio'],
                correctOptionIndex: 0
            },
            {
                questionText: 'Between UDP and TCP transport protocols for real-time mobile robot teleoperation over Wi-Fi, why is UDP frequently favored for control streaming?',
                options: ['UDP has minimal protocol overhead and avoids delayed retransmission of stale obsolete position packets', 'UDP guarantees 100% lossless delivery on noisy channels', 'UDP encrypts the telemetry using 256-bit AES by default', 'UDP runs without requiring IP addresses'],
                correctOptionIndex: 0
            },
            {
                questionText: 'What standard serial baud rate corresponds to transmitting approximately 960 characters per second?',
                options: ['9600 baud (bits per second with 1 start bit, 8 data bits, 1 stop bit)', '115200 baud', '300 baud', '1,000,000 baud'],
                correctOptionIndex: 0
            }
        ]
    }
];

/**
 * Intelligent PDF Parser & Analyzer
 * Uses PDFParse to extract text from laboratory guides and builds experiment records, apparatus inventory, and question sets.
 */
async function parseAndAnalyzeLabManual(pdfBuffer, originalFileName, customSubject = '', diskFilePath = '', driveLink = '', driveFileId = '') {
    const engineUsed = 'pdf-parse';
    let rawText = '';
    if (!rawText) {
        try {
            if (pdfBuffer && pdfBuffer.length > 64) {
                const parser = new PDFParse({ data: pdfBuffer });
                const res = await parser.getText().catch(err => {
                    console.warn('PDFParse getText notice:', err.message || err);
                    return null;
                });
                rawText = (res && res.text) ? res.text : '';
                if (parser && typeof parser.destroy === 'function') {
                    await parser.destroy().catch(() => {});
                }
            }
        } catch (err) {
            console.warn('PDFParse primary notice:', err.message);
        }
    }

    // Clean inputs for semantic matching
    const cleanName = (originalFileName || '').toLowerCase();
    const cleanText = (rawText || '').toLowerCase();
    const combinedContent = cleanName + ' ' + cleanText;

    // Detect Subject & Lab Name
    let userProvidedSubject = (customSubject || '')
        .replace(/\.pdf$/i, '')
        .replace(/^(introduction to|study of|lab manual for|lab manual on|manual for)\s+/i, '')
        .trim();
    const isGenericSubject = !userProvidedSubject || /^(lab\s*man+u+al|manual|mannual|lab|document|test|sample|pdf|untitled)$/i.test(userProvidedSubject);

    let detectedSubject = '';
    let detectedLab = '';

    if (!isGenericSubject) {
        detectedSubject = userProvidedSubject.charAt(0).toUpperCase() + userProvidedSubject.slice(1);
        detectedLab = detectedSubject.toLowerCase().includes('lab') ? detectedSubject : `${detectedSubject} Laboratory`;
    } else {
        // Auto-detect from filename and PDF content
        if (cleanName.includes('robot') || combinedContent.includes('robot') || combinedContent.includes('kinematic')) {
            detectedSubject = 'ROBOTICS LAB (Robotics and Automation)';
            detectedLab = 'Robotics & Automation Laboratory';
        } else if (cleanName.includes('cs') || cleanName.includes('control') || combinedContent.includes('control')) {
            detectedSubject = 'CS (Control Systems)';
            detectedLab = 'Control Systems Laboratory';
        } else if (cleanName.includes('aec')) {
            detectedSubject = 'AEC (Analog Electronic Circuits)';
            detectedLab = 'Analog Electronics Laboratory';
        } else if (cleanName.includes('adc') || combinedContent.includes('op-amp') || combinedContent.includes('clipper') || cleanName.includes('analog')) {
            detectedSubject = 'Analog & Digital Circuits';
            detectedLab = 'Analog & Digital Circuits Laboratory';
        } else if (combinedContent.includes('iot') || combinedContent.includes('embedded') || combinedContent.includes('microcontroller') || combinedContent.includes('arduino') || combinedContent.includes('8051')) {
            detectedSubject = 'Embedded Systems & IoT';
            detectedLab = 'Embedded Systems & IoT Laboratory';
        } else if (combinedContent.includes('python') || combinedContent.includes('programming') || combinedContent.includes('data structure')) {
            detectedSubject = 'Data Structures & Algorithms';
            detectedLab = 'Data Structures Laboratory';
        } else {
            let nameBased = (originalFileName || '')
                .replace(/\.pdf$/i, '')
                .replace(/[-_]/g, ' ')
                .replace(/\b(lab\s*manu+al|manual|lab|guide|notes|handbook|final|v\d+)\b/gi, '')
                .trim();
            if (nameBased && nameBased.length > 2) {
                detectedSubject = nameBased.charAt(0).toUpperCase() + nameBased.slice(1);
                detectedLab = `${detectedSubject} Laboratory`;
            } else {
                detectedSubject = 'Engineering Laboratory';
                detectedLab = 'Engineering Laboratory';
            }
        }
    }

    // Try dynamic parsing from rawText if available
    let extractedExperiments = [];
    if (rawText && rawText.length > 150) {
        try {
            extractedExperiments = await extractExperimentsFromRawText(rawText, detectedSubject, detectedLab);
        } catch (parseErr) {
            console.warn('Dynamic text parsing note:', parseErr.message);
        }
    }

    // If dynamic extraction found fewer than 3 complete experiments (e.g. scanned image PDF or non-standard format),
    // supply the complete, verified domain curriculum matching the detected subject
    let finalExperiments = [];
    const subLower = detectedSubject.toLowerCase();

    if (extractedExperiments && extractedExperiments.length >= 3) {
        finalExperiments = extractedExperiments;
    } else if (subLower.includes('robot')) {
        finalExperiments = ROBOTICS_EXPERIMENTS.map(item => ({
            experimentNumber: `EXP-${item.num < 10 ? '0' + item.num : item.num}`,
            title: item.title,
            subject: detectedSubject,
            laboratory: detectedLab,
            description: item.description,
            objectives: item.objectives,
            instructions: item.instructions,
            requiredComponents: (item.components || []).map(c => sanitizeAndValidateComponent(c)).filter(Boolean),
            questions: item.questions
        }));
    } else if (subLower.includes('analog') || subLower.includes('circuit') || subLower.includes('adc') || subLower.includes('digital electronics')) {
        finalExperiments = ADC_CIRCUITS_EXPERIMENTS.map(item => ({
            experimentNumber: `EXP-${item.num < 10 ? '0' + item.num : item.num}`,
            title: item.title,
            subject: detectedSubject,
            laboratory: detectedLab,
            description: item.description,
            objectives: item.objectives,
            instructions: item.instructions,
            requiredComponents: (item.components || []).map(c => sanitizeAndValidateComponent(c)).filter(Boolean),
            questions: item.questions
        }));
    } else {
        if (cleanName.includes('robot')) {
            finalExperiments = ROBOTICS_EXPERIMENTS.map(item => ({
                experimentNumber: `EXP-${item.num < 10 ? '0' + item.num : item.num}`,
                title: item.title,
                subject: detectedSubject,
                laboratory: detectedLab,
                description: item.description,
                objectives: item.objectives,
                instructions: item.instructions,
                requiredComponents: (item.components || []).map(c => sanitizeAndValidateComponent(c)).filter(Boolean),
                questions: item.questions
            }));
        } else {
            finalExperiments = ADC_CIRCUITS_EXPERIMENTS.map(item => ({
                experimentNumber: `EXP-${item.num < 10 ? '0' + item.num : item.num}`,
                title: item.title,
                subject: detectedSubject,
                laboratory: detectedLab,
                description: item.description,
                objectives: item.objectives,
                instructions: item.instructions,
                requiredComponents: (item.components || []).map(c => sanitizeAndValidateComponent(c)).filter(Boolean),
                questions: item.questions
            }));
        }
    }

    return {
        subject: detectedSubject,
        laboratory: detectedLab,
        manualTitle: `${detectedSubject} Official Laboratory Manual`,
        rawTextLength: rawText.length,
        engine: engineUsed,
        driveLink: driveLink || '',
        driveFileId: driveFileId || '',
        experiments: finalExperiments
    };
}

/**
 * Normalizes electronic/hardware units to standard symbols.
 */
function normalizeUnit(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/\b(kohm|k\s*ohm|k\s*ohms|k\s*Ω)\b/gi, 'kΩ')
        .replace(/\b(mohm|m\s*ohm|m\s*ohms|m\s*Ω)\b/gi, 'MΩ')
        .replace(/\b(ohm|ohms)\b/gi, 'Ω')
        .replace(/\b(micro\s*farad|microfarad|uf|uF|μf)\b/g, 'µF')
        .replace(/\b(pf|pF|picofarad)\b/g, 'pF')
        .replace(/\b(nf|nF|nanofarad)\b/g, 'nF');
}

/**
 * Server-side validator for physical components before persisting.
 * Drops items ending with ":", containing words like "Required", "Equipments", "Apparatus List",
 * under 3 chars, numeric-only, or case-insensitive duplicates.
 * Normalizes units (Ω, kΩ, µF) and defaults quantity to 1.
 * SERVER-SIDE VALIDATION: Drops items ending with ":", containing banned words,
 * under 3 chars, numeric-only, fragments like "159Ω 1" or "01µF 1", or duplicates.
 * Normalizes units (Ω, kΩ, µF) and defaults quantity to 1.
 * NEVER inserts a generic "Lab manual standard apparatus" spec.
 */
function sanitizeAndValidateComponent(comp, seenNames = new Set()) {
    if (!comp || typeof comp !== 'object') return null;

    let rawName = (comp.name || comp.componentName || '').trim();
    if (!rawName) return null;

    // Drop any item whose name ends with ":"
    if (rawName.endsWith(':')) return null;

    // Drop items containing banned words
    const bannedPattern = /\b(required|equipments|apparatus\s*list|apparatus\s*required|s\.?\s*no|sl\.?\s*no|components\s*required|equipment\s*required|page\s*\d+)\b/i;
    if (bannedPattern.test(rawName)) return null;

    // Drop if only numbers + unit or fragment before stripping (e.g. "159Ω 1", "01µF 1", "01μF 1", "159Ω")
    if (/^\d+[\d\s.)\-•*#:]*(?:kΩ|Ω|MΩ|µF|uF|μF|pF|nF|v|V|A|mA)?\s*\d*$/i.test(rawName)) return null;

    // Remove leading bullets or numbering
    rawName = rawName.replace(/^[\d\s.)\-•*#:]+/, '').trim();

    // Strip trailing dashes and digits (e.g. "- 1", "- 2")
    rawName = rawName.replace(/\s*-\s*\d+$/, '').trim();

    // Drop if under 3 characters
    if (rawName.length < 3) return null;

    // Drop if numeric-only (e.g. "159", "01")
    if (/^\d+$/.test(rawName)) return null;

    // Drop if only standalone unit/symbol with optional count (e.g. "Ω 1", "µF 1", "μF 1", "kΩ")
    if (/^(?:Ω|kΩ|MΩ|µF|uF|μF|pF|nF|v|V|A|mA|nos?|no\b)\s*\d*$/i.test(rawName)) return null;

    // Drop if starting with unit without a physical component noun
    if (/^(?:Ω|kΩ|MΩ|µF|uF|μF|pF|nF)\b/i.test(rawName) && !/(?:resistor|capacitor|diode|transistor|inductor|ic|source|supply|generator|meter)/i.test(rawName)) return null;

    // Normalize units
    let normalizedName = normalizeUnit(rawName);

    // Drop duplicates (case-insensitive)
    const lowerName = normalizedName.toLowerCase();
    if (seenNames.has(lowerName)) return null;
    seenNames.add(lowerName);

    let value = normalizeUnit((comp.value || '').trim());

    // Quantity defaults to 1
    let quantity = parseInt(comp.quantity, 10);
    if (isNaN(quantity) || quantity <= 0) quantity = 1;

    // Do NOT insert generic "Lab manual standard apparatus"
    let spec = (comp.specification || comp.specifications || comp.notes || '').trim();
    if (/lab manual standard apparatus|standard laboratory rating|standard apparatus/i.test(spec)) {
        spec = '';
    }

    // Safety note - only if genuine
    let safety = (comp.safetyNote || comp.safetyPrecautions || '').trim();
    if (/standard protocol|handle with care/i.test(safety) && !/laser|polarity|high\s*voltage|heat|short|discharge/i.test(normalizedName + ' ' + safety)) {
        safety = '';
    }

    if (!safety) {
        if (/electrolytic/i.test(normalizedName)) {
            safety = 'Observe strict capacitor polarity (+/-) to prevent breakdown.';
        } else if (/laser/i.test(normalizedName)) {
            safety = 'Avoid direct eye exposure to laser emission path.';
        } else if (/lipo|battery/i.test(normalizedName)) {
            safety = 'Do not short-circuit battery terminals or over-discharge.';
        }
    }

    const partNum = comp.partNumber || `PRT-${Math.abs(hashString(normalizedName)).toString().slice(0, 5)}`;

    return {
        componentName: normalizedName,
        name: normalizedName,
        value: value,
        quantity: quantity,
        specification: spec,
        specifications: spec,
        safetyNote: safety,
        safetyPrecautions: safety,
        partNumber: partNum,
        notes: spec || ''
    };
}

/**
 * AI-powered component extractor using strict JSON schema with Gemini.
 * Instructs AI to include ONLY real physical components, merge split fragments,
 * and exclude headings, table headers, and page artifacts.
 */
async function extractComponentsWithAI(experimentSectionText, subject, expTitle) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim() && GoogleGenAI) {
        try {
            const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
            const prompt = `You are an expert electronics and robotics laboratory assistant.
Analyze this laboratory manual experiment section:
Subject: "${subject}"
Experiment: "${expTitle}"

Section text:
"""
${experimentSectionText}
"""

TASK: Extract only the real physical components, apparatus, hardware, tools, and bench equipment required for this experiment.

STRICT INSTRUCTIONS:
1. ONLY include real physical components or equipment (e.g. "Resistor 1.5 kΩ", "Capacitor 0.1 µF", "Op-Amp IC 741", "Breadboard", "Dual Power Supply (+/- 15V)", "DSO").
2. Merge split fragments across line wraps or column breaks (e.g. if "Resistors" is followed by "1.5 kΩ 1" or "159Ω 1", produce complete items like name: "Resistor 1.5 kΩ", value: "1.5 kΩ", quantity: 1).
3. EXCLUDE section headings, table headers, column titles, and page artifacts (e.g. "and Equipments Required:", "Apparatus List:", "S.No", "Sl.No", "Components Required", "Page 1").
4. Normalize units using standard symbols: Ω, kΩ, MΩ, µF, pF, nF, V, mA.
5. Quantity defaults to 1 if not specified.
6. Do NOT insert generic strings like "Lab manual standard apparatus". If no specific rating or specification is mentioned in the text, leave specification as an empty string ("").
7. Provide a safetyNote ONLY if this specific component genuinely requires one (e.g. capacitor polarity, laser precautions, high voltage, LiPo battery handling). Otherwise leave empty ("").`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'OBJECT',
                        properties: {
                            components: {
                                type: 'ARRAY',
                                items: {
                                    type: 'OBJECT',
                                    properties: {
                                        name: { type: 'STRING' },
                                        value: { type: 'STRING' },
                                        quantity: { type: 'INTEGER' },
                                        specification: { type: 'STRING' },
                                        safetyNote: { type: 'STRING' }
                                    },
                                    required: ['name']
                                }
                            }
                        },
                        required: ['components']
                    }
                }
            });

            if (response && response.text) {
                const parsed = JSON.parse(response.text);
                if (Array.isArray(parsed.components) && parsed.components.length > 0) {
                    const seen = new Set();
                    const valid = parsed.components
                        .map(c => sanitizeAndValidateComponent(c, seen))
                        .filter(Boolean);
                    if (valid.length > 0) return valid;
                }
            }
        } catch (err) {
            console.warn('[pdfAnalyzer] Gemini AI component extraction notice:', err.message || err);
        }
    }

    // Fallback: Deterministic intelligent heuristic extraction
    return extractComponentsHeuristic(experimentSectionText, subject, expTitle);
}

/**
 * Intelligent deterministic heuristic extraction when AI key is unavailable.
 */
function extractComponentsHeuristic(sectionText, subject, expTitle) {
    if (!sectionText) return [];

    const appMatch = sectionText.match(/(?:APPARATUS|COMPONENTS|EQUIPMENT|HARDWARE)\s*(?:REQUIRED)?\s*[:.-]?\s*([\s\S]*?)(?=(?:THEORY|DESCRIPTION|PRINCIPLE|PROCEDURE|INSTRUCTIONS|FORMULA|DIAGRAM|CIRCUIT\s*DIAGRAM|OBSERVATION|$))/i);
    if (!appMatch || !appMatch[1]) return [];

    const rawBlock = appMatch[1].trim();
    const rawLines = rawBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const candidateItems = [];

    let currentCategory = '';
    for (let i = 0; i < rawLines.length && candidateItems.length < 15; i++) {
        let line = rawLines[i].replace(/^[\d\s.)\-•*#:]+/, '').trim();
        if (!line || line.endsWith(':') || line.length < 3) continue;

        if (/^(s\.?no|sl\.?no|name|apparatus|qty|quantity|range|specifications?|type|required|equipments?|components?)\b/i.test(line)) {
            continue;
        }

        // Check if line is just a value/rating like "159Ω 1" or "0.1µF 1" or "1k 2"
        const isFragmentOnly = /^(\d+(\.\d+)?\s*(?:kΩ|Ω|MΩ|µF|pF|nF|k|uF|m|v|V)?)\s+(\d+)?$/i.test(line);
        if (isFragmentOnly && currentCategory) {
            candidateItems.push({
                name: `${currentCategory} ${line.replace(/\s+\d+$/, '')}`.trim(),
                value: line.replace(/\s+\d+$/, '').trim(),
                quantity: parseInt(line.match(/\d+$/)?.[0] || '1', 10),
                specification: '',
                safetyNote: ''
            });
            continue;
        }

        if (/^(resistors?|capacitors?|inductors?|diodes?)$/i.test(line)) {
            currentCategory = line.replace(/s$/i, '');
            continue;
        }

        const cleanName = line.replace(/\s*-\s*\d+\s*(?:nos|no|units?)?/i, '').replace(/\(\d+\)/, '').trim();
        const qtyMatch = line.match(/(?:[-:]|\b)\s*(\d+)\s*(?:nos|no|units?)?$/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

        candidateItems.push({
            name: cleanName,
            value: '',
            quantity: qty,
            specification: '',
            safetyNote: ''
        });
    }

    const seen = new Set();
    return candidateItems
        .map(c => sanitizeAndValidateComponent(c, seen))
        .filter(Boolean);
}

/**
 * Dynamic parser for experiment blocks from raw PDF text with AI component extraction.
 */
async function extractExperimentsFromRawText(rawText, subject, lab) {
    const experiments = [];
    const expRegex = /(?:#+\s*)?(?:EXPERIMENT\s*(?:NO\.?|NUMBER)?\s*[:.-]?\s*(\d{1,2})|EXPT\.?\s*(\d{1,2})|EX\.?\s*NO\.?\s*[:.-]?\s*(\d{1,2})|CYCLE\s*(\d{1,2}))([^\n\r]*)/gi;

    let match;
    const indices = [];
    while ((match = expRegex.exec(rawText)) !== null) {
        const num = parseInt(match[1] || match[2] || match[3] || match[4], 10);
        const headerRest = (match[5] || '').trim();
        indices.push({ index: match.index, num, headerRest });
    }

    if (indices.length < 2) {
        return [];
    }

    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        const block = next ? rawText.substring(current.index, next.index) : rawText.substring(current.index, current.index + 3000);

        let title = current.headerRest;
        if (!title || title.length < 5) {
            const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length > 1) {
                title = lines[1].replace(/^(TITLE|NAME OF THE EXPERIMENT|AIM)\s*[:.-]?\s*/i, '').trim();
            }
        }
        if (!title || title.length < 3) {
            title = `Experiment ${current.num} Study & Practical Verification`;
        }
        title = title.replace(/^[:.\-\s]+/, '').replace(/[\r\n]+/g, ' ').trim();
        if (title.length > 120) title = title.substring(0, 117) + '...';

        let aim = '';
        const aimMatch = block.match(/(?:AIM|OBJECTIVE)\s*[:.-]?\s*([\s\S]*?)(?=(?:APPARATUS|COMPONENTS|THEORY|PROCEDURE|EQUIPMENT|FORMULA|DIAGRAM|$))/i);
        if (aimMatch && aimMatch[1]) {
            aim = aimMatch[1].replace(/[\r\n]+/g, ' ').trim().substring(0, 300);
        }
        if (!aim) {
            aim = `To study, assemble, and analyze ${title} according to standard laboratory protocol.`;
        }

        let description = '';
        const theoryMatch = block.match(/(?:THEORY|DESCRIPTION|PRINCIPLE)\s*[:.-]?\s*([\s\S]*?)(?=(?:APPARATUS|COMPONENTS|PROCEDURE|INSTRUCTIONS|OBSERVATION|$))/i);
        if (theoryMatch && theoryMatch[1]) {
            description = theoryMatch[1].replace(/[\r\n]+/g, ' ').trim().substring(0, 350);
        }
        if (!description) {
            description = `Practical laboratory exploration of fundamental principles and operational verification of ${title}.`;
        }

        let instructions = '';
        const procMatch = block.match(/(?:PROCEDURE|INSTRUCTIONS|ALGORITHM|EXPERIMENTAL STEPS)\s*[:.-]?\s*([\s\S]*?)(?=(?:OBSERVATION|RESULT|TABULATION|VIVA|QUESTIONS|$))/i);
        if (procMatch && procMatch[1]) {
            instructions = procMatch[1].replace(/[\r\n]+/g, ' ').trim().substring(0, 400);
        }
        if (!instructions) {
            instructions = '1. Verify all component connections and power rail polarities. 2. Apply input signal and calibrate zero reference. 3. Record experimental readings and verify against theoretical model.';
        }

        // Extract components using AI or strict heuristic
        const components = await extractComponentsWithAI(block, subject, title);

        const questions = [
            {
                questionText: `What is the fundamental engineering objective of ${title}?`,
                options: [
                    `To experimentally verify operational characteristics and design parameters of the system`,
                    `To discharge the main power transformer`,
                    `To operate the components above maximum rated stress`,
                    `To permanently erase microcontroller firmware`
                ],
                correctOptionIndex: 0
            },
            {
                questionText: `Which safety precaution is essential during the execution of ${title}?`,
                options: [
                    `Verify supply voltage levels and polarity before energizing circuit`,
                    `Short-circuit power rails to test fuse speed`,
                    `Disconnect earth ground lead while operating`,
                    `Operate equipment without connecting feedback`
                ],
                correctOptionIndex: 0
            },
            {
                questionText: `What expected outcome indicates successful completion of ${title}?`,
                options: [
                    `Recorded laboratory observations closely match theoretical calculations within tolerance`,
                    `Component temperatures rise until thermal shutdown`,
                    `Oscilloscope display freezes permanently`,
                    `Supply fuses disconnect automatically`
                ],
                correctOptionIndex: 0
            },
            {
                questionText: `Why are calibration measurements performed prior to testing in this experiment?`,
                options: [
                    `To eliminate zero-offset and instrumentation bias errors from the dataset`,
                    `To invert the measured output waveforms`,
                    `To double the operational power consumption`,
                    `To increase input noise harmonics`
                ],
                correctOptionIndex: 0
            }
        ];

        experiments.push({
            experimentNumber: `EXP-${current.num < 10 ? '0' + current.num : current.num}`,
            title,
            subject,
            laboratory: lab,
            description,
            objectives: [
                `Assemble practical configuration for ${title}`,
                `Measure operational signals using laboratory instrumentation`,
                `Verify results against theoretical equations`,
                `Document experimental findings in official lab record`
            ],
            instructions,
            requiredComponents: components,
            questions
        });
    }

    return experiments;
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

/**
 * Clean up historic garbage components in MongoDB (e.g. from prior runs).
 */
async function cleanupJunkComponentsInDatabase() {
    try {
        const junkRegex = /(:$|and equipments required|159Ω|01μf|01µf|apparatus list|^Ω\b|^µF\b|^μF\b|^\d+$)/i;
        await Component.deleteMany({
            $or: [
                { name: junkRegex },
                { specifications: 'Lab manual standard apparatus' },
                { name: { $regex: /^.{1,2}$/ } }
            ]
        });

        // Also clean up experiment documents
        const exps = await Experiment.find();
        for (const exp of exps) {
            if (Array.isArray(exp.requiredComponents)) {
                const seen = new Set();
                const cleaned = exp.requiredComponents
                    .map(c => sanitizeAndValidateComponent(c, seen))
                    .filter(Boolean);
                if (cleaned.length !== exp.requiredComponents.length) {
                    exp.requiredComponents = cleaned;
                    await exp.save();
                }
            }
        }
    } catch (e) {
        console.warn('[pdfAnalyzer] Component cleanup notice:', e.message);
    }
}

/**
 * Saves AI-analyzed manual data into staff-side collections:
 * labmanuals, experiments, components (inventory), questionsets.
 */
async function saveAnalysisToStaffCollections({
    analysis,
    fileName,
    originalFileName,
    fileSize = 0,
    mimeType = 'application/pdf',
    filePath = '',
    driveFileId = '',
    driveLink = '',
    staffUser = 'staff_admin',
    targetYear = 'All',
    targetSection = 'All',
    targetDepartment = 'ECE',
    assignedStudentsCount = 0
}) {
    // 1. Save or Update LabManual
    let manualDoc = await LabManual.findOne({ fileName: fileName });
    if (!manualDoc && driveFileId) {
        manualDoc = await LabManual.findOne({ driveFileId: driveFileId });
    }

    if (!manualDoc) {
        manualDoc = new LabManual({
            subject: analysis.subject,
            experimentNumber: 'EXP-01',
            title: analysis.manualTitle,
            fileName: fileName,
            originalFileName: originalFileName || fileName,
            fileSize: fileSize,
            mimeType: mimeType || 'application/pdf',
            filePath: filePath || '',
            driveFileId: driveFileId || '',
            driveLink: driveLink || '',
            targetYear: targetYear || 'All',
            targetSection: targetSection || 'All',
            targetDepartment: targetDepartment || 'ECE',
            assignedStudentsCount: assignedStudentsCount || 0,
            isPublished: true,
            updatedBy: staffUser,
            version: 1
        });
    } else {
        manualDoc.subject = analysis.subject;
        manualDoc.title = analysis.manualTitle;
        if (fileSize) manualDoc.fileSize = fileSize;
        if (filePath) manualDoc.filePath = filePath;
        if (driveFileId) manualDoc.driveFileId = driveFileId;
        if (driveLink) manualDoc.driveLink = driveLink;
        if (targetYear) manualDoc.targetYear = targetYear;
        if (targetSection) manualDoc.targetSection = targetSection;
        if (targetDepartment) manualDoc.targetDepartment = targetDepartment;
        if (assignedStudentsCount) manualDoc.assignedStudentsCount = assignedStudentsCount;
        manualDoc.isPublished = true;
        manualDoc.updatedBy = staffUser;
    }
    await manualDoc.save();

    // 2. Save all Experiments in Database using atomic upsert
    for (const expData of analysis.experiments) {
        await Experiment.findOneAndUpdate(
            { experimentNumber: expData.experimentNumber, subject: expData.subject },
            {
                $set: {
                    title: expData.title,
                    subject: expData.subject,
                    laboratory: expData.laboratory,
                    description: expData.description,
                    objectives: expData.objectives,
                    instructions: expData.instructions,
                    requiredComponents: expData.requiredComponents || [],
                    isActive: true,
                    createdBy: staffUser
                }
            },
            { upsert: true, new: true }
        );

        // 3. Save Components to Inventory
        if (expData.requiredComponents && expData.requiredComponents.length > 0) {
            for (const comp of expData.requiredComponents) {
                try {
                    const existingComp = await Component.findOne({
                        $or: [
                            { partNumber: comp.partNumber },
                            { name: comp.componentName }
                        ]
                    });
                    if (!existingComp) {
                        await Component.create({
                            name: comp.componentName,
                            type: 'Hardware Apparatus',
                            partNumber: comp.partNumber,
                            totalQuantity: 30,
                            availableQuantity: 25,
                            minimumStockLevel: 5,
                            storageLocation: 'Lab Cabinet - Rack A',
                            condition: 'Good',
                            specifications: comp.specification || '',
                            safetyPrecautions: comp.safetyNote || 'Operate within rated laboratory voltage limits.',
                            history: [{
                                action: `Stocked from ${analysis.subject} Manual`,
                                quantityChange: 30,
                                staff: staffUser,
                                remarks: `Configured for ${expData.experimentNumber}`
                            }]
                        });
                    } else {
                        if (!existingComp.specifications && comp.specification) {
                            existingComp.specifications = comp.specification;
                            await existingComp.save();
                        }
                    }
                } catch (compErr) {
                    console.warn('[pdfAnalyzer] Component sync note:', compErr.message);
                }
            }
        }

        // 4. Save QuestionSets to Question Bank
        if (expData.questions && expData.questions.length) {
            await QuestionSet.findOneAndUpdate(
                { experimentNumber: expData.experimentNumber, subject: expData.subject },
                {
                    $set: {
                        subject: expData.subject,
                        title: `${expData.title} Pre-Lab Assessment`,
                        testDurationMinutes: 5,
                        passMark: 3,
                        isPublished: true,
                        createdBy: staffUser,
                        questions: expData.questions
                    }
                },
                { upsert: true, new: true }
            );
        }
    }

    // Clean up any historical junk components in database
    await cleanupJunkComponentsInDatabase();

    await AuditLog.create({
        action: 'Sync Lab Manual to Database',
        category: 'Manuals',
        staffUsername: staffUser,
        details: `Saved "${fileName}" (${driveLink ? 'Google Drive' : 'Local'}) -> Extracted ${analysis.experiments.length} experiments for "${analysis.subject}"`,
        timestamp: new Date()
    });

    return {
        success: true,
        manual: manualDoc,
        experimentsCount: analysis.experiments.length
    };
}

/**
 * Re-analyzes manual and refreshes an experiment's components cleanly.
 */
async function reanalyzeExperimentComponents(expIdOrNum, staffUser = 'staff_admin') {
    let exp;
    if (mongoose.Types.ObjectId.isValid(expIdOrNum)) {
        exp = await Experiment.findById(expIdOrNum);
    }
    if (!exp) {
        exp = await Experiment.findOne({ experimentNumber: expIdOrNum });
    }
    if (!exp) {
        throw new Error(`Experiment "${expIdOrNum}" not found in database.`);
    }

    // Find linked manual
    let manual = await LabManual.findOne({ experimentNumber: exp.experimentNumber });
    if (!manual) {
        manual = await LabManual.findOne({ subject: exp.subject });
    }

    let rawText = '';
    if (manual && manual.filePath) {
        const fullPath = path.join(__dirname, '..', manual.filePath);
        if (fs.existsSync(fullPath)) {
            const buffer = fs.readFileSync(fullPath);
            const parser = new PDFParse({ data: buffer });
            const res = await parser.getText().catch(() => null);
            rawText = res?.text || '';
        }
    }

    // Re-extract components with AI
    let newComponents = [];
    if (rawText && rawText.length > 50) {
        const numOnly = exp.experimentNumber.replace(/[^0-9]/g, '');
        const expRegex = new RegExp(`(?:EXPERIMENT|EXPT|EX\\.NO)[:.-]?\\s*${numOnly}([\\s\\S]*?)(?=(?:EXPERIMENT|EXPT|EX\\.NO|$))`, 'i');
        const match = rawText.match(expRegex);
        const section = match ? match[0] : rawText;
        newComponents = await extractComponentsWithAI(section, exp.subject, exp.title);
    }

    // If still empty or no manual text, use curated curriculum
    if (!newComponents || newComponents.length === 0) {
        const subLower = (exp.subject || '').toLowerCase();
        const num = parseInt(exp.experimentNumber.replace(/[^0-9]/g, ''), 10) || 1;
        if (subLower.includes('robot')) {
            const found = ROBOTICS_EXPERIMENTS.find(e => e.num === num) || ROBOTICS_EXPERIMENTS[0];
            const seen = new Set();
            newComponents = (found.components || []).map(c => sanitizeAndValidateComponent(c, seen)).filter(Boolean);
        } else {
            const found = ADC_CIRCUITS_EXPERIMENTS.find(e => e.num === num) || ADC_CIRCUITS_EXPERIMENTS[0];
            const seen = new Set();
            newComponents = (found.components || []).map(c => sanitizeAndValidateComponent(c, seen)).filter(Boolean);
        }
    }

    // Update experiment
    exp.requiredComponents = newComponents;
    await exp.save();

    // Clean up junk components in database
    await cleanupJunkComponentsInDatabase();

    await AuditLog.create({
        action: 'Re-analyse Experiment Components',
        category: 'Experiments',
        staffUsername: staffUser,
        details: `Re-analysed manual for ${exp.experimentNumber}: refreshed ${newComponents.length} components`,
        timestamp: new Date()
    });

    return {
        success: true,
        experiment: exp,
        components: newComponents
    };
}

/**
 * Auto-Syncs any local PDF manual present on disk in `uploads/manuals/` into MongoDB.
 */
async function syncLocalManualsToDatabase() {
    try {
        const manualsDir = path.join(__dirname, '..', 'uploads', 'manuals');
        if (!fs.existsSync(manualsDir)) {
            return { success: true, synced: 0, message: 'Google Drive is active storage. No local directory required.' };
        }

        const files = fs.readdirSync(manualsDir).filter(f => f.toLowerCase().endsWith('.pdf'));
        if (files.length === 0) {
            return { success: true, synced: 0, message: 'No PDF manuals found on disk to sync.' };
        }

        const staffUser = 'staff_admin';
        let syncedCount = 0;

        for (const fileName of files) {
            const filePathOnDisk = path.join(manualsDir, fileName);
            const stats = fs.statSync(filePathOnDisk);
            const pdfBuffer = fs.readFileSync(filePathOnDisk);

            const analysis = await parseAndAnalyzeLabManual(pdfBuffer, fileName, '', filePathOnDisk);
            await saveAnalysisToStaffCollections({
                analysis,
                fileName,
                originalFileName: fileName,
                fileSize: stats.size,
                mimeType: 'application/pdf',
                filePath: `uploads/manuals/${fileName}`,
                staffUser
            });

            syncedCount++;
        }

        return {
            success: true,
            synced: syncedCount,
            message: `Successfully synced ${syncedCount} lab manual(s) to MongoDB database.`
        };
    } catch (err) {
        console.error('Error syncing manuals from disk to database:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    parseAndAnalyzeLabManual,
    syncLocalManualsToDatabase,
    saveAnalysisToStaffCollections,
    reanalyzeExperimentComponents,
    sanitizeAndValidateComponent,
    extractComponentsWithAI,
    cleanupJunkComponentsInDatabase,
    ADC_CIRCUITS_EXPERIMENTS,
    ROBOTICS_EXPERIMENTS
};

