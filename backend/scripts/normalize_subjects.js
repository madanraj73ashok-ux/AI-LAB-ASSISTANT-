const { initDatabases } = require('../db');
const Experiment = require('../models/Experiment');
const QuestionSet = require('../models/QuestionSet');

async function run() {
    try {
        await initDatabases();
        console.log('Connected to DB');

        // 1. Remove duplicate/legacy robotics experiments that conflict
        await Experiment.deleteMany({
            subject: { $in: ['Robotics', 'MATLAB Robotics Toolbox and Robot Modeling'] }
        });
        await QuestionSet.deleteMany({
            subject: { $in: ['Robotics', 'MATLAB Robotics Toolbox and Robot Modeling'] }
        });

        // 2. Rename remaining 'Robotics and Automation' to 'ROBOTICS LAB (Robotics and Automation)'
        const robUpdated = await Experiment.updateMany(
            { subject: 'Robotics and Automation' },
            { $set: { subject: 'ROBOTICS LAB (Robotics and Automation)', laboratory: 'Robotics & Automation Laboratory' } }
        );
        console.log('Robotics experiments updated:', robUpdated.modifiedCount);

        await QuestionSet.updateMany(
            { subject: 'Robotics and Automation' },
            { $set: { subject: 'ROBOTICS LAB (Robotics and Automation)' } }
        );

        // 3. Ensure AEC (Analog Electronic Circuits) has all 10
        const aecCount = await Experiment.countDocuments({ subject: 'AEC (Analog Electronic Circuits)' });
        console.log('AEC experiments count:', aecCount);

        // 4. Ensure CS (Control Systems) experiments exist
        const csCount = await Experiment.countDocuments({ subject: 'CS (Control Systems)' });
        console.log('CS experiments count:', csCount);

        if (csCount === 0) {
            const csExperiments = [
                {
                    experimentNumber: 'EXP-01',
                    title: 'Transfer Function and Transient Response of First and Second Order Systems',
                    subject: 'CS (Control Systems)',
                    laboratory: 'Control Systems Laboratory',
                    description: 'Determine time domain specifications (rise time, peak time, overshoot, settling time) of second order RLC systems using step response analysis.',
                    objectives: [
                        'Derive open-loop and closed-loop transfer functions',
                        'Measure step response parameters using oscilloscope and MATLAB',
                        'Analyze the effect of damping ratio on stability'
                    ],
                    instructions: 'Connect the OP-AMP based second order simulation circuit. Apply a 1kHz square wave input. Record the response on the digital oscilloscope.',
                    requiredComponents: [
                        { componentName: 'Op-Amp IC 741 / TL084', partNumber: 'IC-741', quantity: 2, notes: 'Operational amplifier for active filter / system simulation' },
                        { componentName: 'Precision Resistors (10k, 100k)', partNumber: 'RES-10K', quantity: 6, notes: 'Metal film 1% tolerance' },
                        { componentName: 'Capacitors (0.01uF, 0.1uF)', partNumber: 'CAP-0.1U', quantity: 4, notes: 'Ceramic / Polyester capacitors' },
                        { componentName: 'Dual Power Supply (±15V)', partNumber: 'PS-15V', quantity: 1, notes: 'Regulated DC source' }
                    ],
                    isActive: true
                },
                {
                    experimentNumber: 'EXP-02',
                    title: 'Frequency Response Analysis using Bode Plot and Nyquist Plot',
                    subject: 'CS (Control Systems)',
                    laboratory: 'Control Systems Laboratory',
                    description: 'Experimentally verify gain margin and phase margin of lead-lag networks and determine closed-loop stability using frequency domain techniques.',
                    objectives: [
                        'Plot magnitude and phase vs frequency on semilog graph',
                        'Determine Gain Margin (GM) and Phase Margin (PM)',
                        'Correlate bandwidth with transient speed of response'
                    ],
                    instructions: 'Vary input frequency from 10Hz to 100kHz using function generator. Record input vs output amplitude and phase shift.',
                    requiredComponents: [
                        { componentName: 'Function Generator (1Hz - 10MHz)', partNumber: 'FG-10M', quantity: 1, notes: 'Sine wave test signal generator' },
                        { componentName: 'Digital Storage Oscilloscope (DSO)', partNumber: 'DSO-100', quantity: 1, notes: '2-channel phase measurement' },
                        { componentName: 'RC Network Board', partNumber: 'BD-RC', quantity: 1, notes: 'Passive lead and lag network' }
                    ],
                    isActive: true
                },
                {
                    experimentNumber: 'EXP-03',
                    title: 'Design and Tuning of Analog PID Controller for DC Motor Speed and Position Control',
                    subject: 'CS (Control Systems)',
                    laboratory: 'Control Systems Laboratory',
                    description: 'Implement proportional, integral, and derivative control loops using operational amplifiers to regulate DC motor shaft position and speed under variable load.',
                    objectives: [
                        'Configure Proportional (Kp), Integral (Ki), and Derivative (Kd) operational circuits',
                        'Tune PID gains using Ziegler-Nichols closed-loop oscillation method',
                        'Evaluate steady-state error reduction and disturbance rejection'
                    ],
                    instructions: 'Couple the DC servo motor with the feedback potentiometer. Adjust Kp until sustained oscillation occurs, then calculate Ki and Kd.',
                    requiredComponents: [
                        { componentName: 'DC Servo Motor with Optical Encoder / Potentiometer', partNumber: 'MOT-SERVO-12V', quantity: 1, notes: 'Geared DC motor feedback unit' },
                        { componentName: 'Quad Op-Amp IC LM324', partNumber: 'IC-LM324', quantity: 2, notes: 'PID summing and difference amplifiers' },
                        { componentName: 'Precision Potentiometers (100k Multi-turn)', partNumber: 'POT-100K-MT', quantity: 3, notes: 'Gain adjustment trimmers' },
                        { componentName: 'Power Amplifier Module (L298N)', partNumber: 'MOD-L298N', quantity: 1, notes: 'H-bridge motor driver' }
                    ],
                    isActive: true
                },
                {
                    experimentNumber: 'EXP-04',
                    title: 'Closed-Loop Temperature Control System with On-Off and Proportional Control',
                    subject: 'CS (Control Systems)',
                    laboratory: 'Control Systems Laboratory',
                    description: 'Study heating chamber thermal dynamics, sensor calibration using RTD Pt100 / Thermocouple, and compare on-off hysteresis control with continuous proportional control.',
                    objectives: [
                        'Calibrate temperature transducer output curve',
                        'Analyze system time constant and transport lag',
                        'Demonstrate reduction of temperature overshoot with proportional control'
                    ],
                    instructions: 'Set temperature setpoint to 50°C. Monitor heater PWM drive and sensor feedback until steady equilibrium is reached.',
                    requiredComponents: [
                        { componentName: 'Thermal Oven Test Chamber', partNumber: 'TH-OVEN-01', quantity: 1, notes: 'Encased heating element with thermal sensor' },
                        { componentName: 'RTD Pt100 Sensor / Signal Conditioner', partNumber: 'SEN-PT100', quantity: 1, notes: 'Temperature probe' },
                        { componentName: 'Solid State Relay (SSR) / MOSFET Switch', partNumber: 'SSR-40A', quantity: 1, notes: 'Power switching stage' }
                    ],
                    isActive: true
                },
                {
                    experimentNumber: 'EXP-05',
                    title: 'State Feedback Controller Design and Pole Placement using Full-State Observer',
                    subject: 'CS (Control Systems)',
                    laboratory: 'Control Systems Laboratory',
                    description: 'Construct state space model of an inverted pendulum or magnetic levitation system and place closed-loop poles using Ackermann formula.',
                    objectives: [
                        'Verify controllability and observability rank criteria',
                        'Compute state feedback gain vector K',
                        'Verify stabilized transient dynamics in hardware simulation'
                    ],
                    instructions: 'Load state observer matrix into DSP / analog simulation unit and verify system stability under external impulse excitation.',
                    requiredComponents: [
                        { componentName: 'Analog System Simulator Module', partNumber: 'MOD-SIM-01', quantity: 1, notes: 'State variable computer' },
                        { componentName: 'BNC to Alligator Patch Cables', partNumber: 'CAB-BNC', quantity: 8, notes: 'Shielded signal probes' }
                    ],
                    isActive: true
                }
            ];

            for (const exp of csExperiments) {
                await Experiment.updateOne(
                    { experimentNumber: exp.experimentNumber, subject: exp.subject },
                    { $set: exp },
                    { upsert: true }
                );

                await QuestionSet.updateOne(
                    { experimentNumber: exp.experimentNumber, subject: exp.subject },
                    {
                        $set: {
                            experimentNumber: exp.experimentNumber,
                            subject: exp.subject,
                            testDurationMinutes: 10,
                            totalMarks: 4,
                            passMark: 3,
                            questions: [
                                {
                                    questionText: 'What is the characteristic equation of a standard second-order control system?',
                                    options: ['s^2 + 2*zeta*omega_n*s + omega_n^2 = 0', 's + omega_n = 0', 's^2 - omega_n^2 = 0', 's^3 + s^2 + s = 0'],
                                    correctOption: 0,
                                    marks: 1
                                },
                                {
                                    questionText: 'If the damping ratio (zeta) is equal to 1, the system response is classified as:',
                                    options: ['Underdamped', 'Critically Damped', 'Overdamped', 'Undamped'],
                                    correctOption: 1,
                                    marks: 1
                                },
                                {
                                    questionText: 'In frequency domain analysis, Gain Margin is measured at which frequency?',
                                    options: ['Gain crossover frequency', 'Phase crossover frequency', 'Resonant frequency', 'Corner frequency'],
                                    correctOption: 1,
                                    marks: 1
                                },
                                {
                                    questionText: 'Which controller action eliminates the steady-state error in a closed-loop system?',
                                    options: ['Derivative (D)', 'Proportional (P)', 'Integral (I)', 'Feedforward only'],
                                    correctOption: 2,
                                    marks: 1
                                }
                            ]
                        }
                    },
                    { upsert: true }
                );
            }
            console.log('✅ Seeded CS (Control Systems) experiments & question sets!');
        }

        const distinct = await Experiment.distinct('subject');
        console.log('Final distinct subjects in DB:', distinct);

        // Also check count per subject
        for (const s of distinct) {
            const count = await Experiment.countDocuments({ subject: s });
            console.log(`- ${s}: ${count} experiments`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error normalizing subjects:', err);
        process.exit(1);
    }
}

run();
