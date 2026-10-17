const fs = require('fs');
const path = require('path');

function createSimplePDF(title, subject) {
    const streamContent = 
`BT
/F1 18 Tf
50 720 Td
(${title}) Tj
/F1 12 Tf
0 -30 Td
(Subject: ${subject}) Tj
0 -25 Td
(Department: Robotics & Electronic Engineering Laboratory) Tj
0 -25 Td
(Official Laboratory Manual - Curriculum Reference) Tj
0 -30 Td
(Pre-Lab Assessment Instructions:) Tj
0 -20 Td
(1. Study the circuit schematic and component ratings before testing.) Tj
0 -20 Td
(2. Follow all ESD and laboratory safety guidelines.) Tj
0 -20 Td
(3. Component issuance will be unlocked after passing the pre-lab assessment.) Tj
ET`;

    const streamLength = Buffer.byteLength(streamContent);

    const pdfParts = [
        '%PDF-1.4\n',
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
        `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
        '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
    ];

    const body = pdfParts.join('');
    const xrefOffset = Buffer.byteLength(body);

    const xref = [
        'xref\n',
        '0 6\n',
        '0000000000 65535 f \n',
        '0000000009 00000 n \n',
        '0000000058 00000 n \n',
        '0000000115 00000 n \n',
        '0000000244 00000 n \n',
        `0000000${String(244 + streamLength + 50).padStart(3, '0')} 00000 n \n`,
        'trailer\n<< /Size 6 /Root 1 0 R >>\n',
        'startxref\n',
        `${xrefOffset}\n`,
        '%%EOF\n'
    ].join('');

    return body + xref;
}

const dir = path.join(__dirname, '..', 'backend', 'uploads', 'manuals');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const manualTemplates = [
    { file: 'ADC Lab Manual.pdf', title: 'Analog & Digital Circuits Official Lab Manual', subject: 'Analog & Digital Circuits / AEC' },
    { file: 'Robotics_Lab_Manual.pdf', title: 'Robotics & Automation Laboratory Manual', subject: 'ROBOTICS LAB' },
    { file: 'CS_Lab_Manual.pdf', title: 'Control Systems Laboratory Manual', subject: 'CS (Control Systems)' }
];

manualTemplates.forEach(m => {
    const p = path.join(dir, m.file);
    fs.writeFileSync(p, createSimplePDF(m.title, m.subject));
    console.log('✅ Generated manual PDF:', m.file);
});

// Also create aliases for any existing DB records
const dbFiles = [
    'manual_EXP_1792073369849_Robotics_Lab_Manual.pdf',
    'manual_EXP_1792073456918_Robotics_Lab_Manual.pdf',
    'manual_EXP_1792078165909_Introduction_to_MATLAB_Robotics_Toolbox_and_Robot_Modeling.pdf',
    'manual_EXP_1792109801280_ADC_Lab_Manual.pdf',
    'manual_EXP_1792109067810_Robotics_Lab_Manual.pdf',
    'manual_EXP_1792109076454_Robotics_Lab_Manual.pdf',
    'manual_EXP_1792109084529_Robotics_Lab_Manual.pdf',
    'manual_EXP_1792109114277_Robotics_Lab_Manual.pdf',
    'manual_EXP_1792109129064_ADC_Lab_Manual.pdf'
];

dbFiles.forEach(f => {
    const target = path.join(dir, f);
    const src = f.toLowerCase().includes('robot') 
        ? path.join(dir, 'Robotics_Lab_Manual.pdf') 
        : path.join(dir, 'ADC Lab Manual.pdf');
    fs.copyFileSync(src, target);
    console.log('✅ Linked DB manual file:', f);
});

console.log('All PDF manuals successfully initialized in backend/uploads/manuals/');
