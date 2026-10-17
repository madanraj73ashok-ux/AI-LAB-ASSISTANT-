/**
 * Glyph Stream - Interactive Liquid Cursor Stream & Splash Effect
 * From React Bits Pro (adapted for high-performance Canvas)
 * 
 * Features:
 * - Deep obsidian/black backdrop
 * - Liquid stream of glowing glyph tiles pouring behind the cursor
 * - Physics-based fluid inertia, rotational drift, and soft fading
 * - Dynamic splash wave burst on mouse / touch clicks
 * - Ambient liquid drift when cursor is idle
 */
(function() {
    'use strict';

    const canvas = document.getElementById('glyph-stream-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let dpr = window.devicePixelRatio || 1;

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.scale(dpr, dpr);
    }

    window.addEventListener('resize', resize);
    resize();

    // Digital & mathematical glyph character pool
    const GLYPHS = [
        '0', '1', 'λ', '§', 'Ψ', '⌘', '◈', '0x', '✦', '{ }', '< >',
        '⟠', '⌬', '∑', '∇', '⚡', '⌗', '⏣', '☵', '⎈', '✧', 'A7', 'FF', 'π', 'Ω', '::', '->', '&&'
    ];

    // Cyberpunk purple/cyan color palette matching portal design tokens
    const PALETTES = [
        {
            fill: 'rgba(139, 92, 246, 0.16)',
            border: 'rgba(167, 139, 250, 0.75)',
            text: '#c4b5fd',
            glow: 'rgba(139, 92, 246, 0.9)'
        },
        {
            fill: 'rgba(124, 58, 237, 0.20)',
            border: 'rgba(192, 132, 252, 0.85)',
            text: '#f3e8ff',
            glow: 'rgba(192, 132, 252, 0.95)'
        },
        {
            fill: 'rgba(56, 189, 248, 0.16)',
            border: 'rgba(56, 189, 248, 0.75)',
            text: '#bae6fd',
            glow: 'rgba(56, 189, 248, 0.85)'
        },
        {
            fill: 'rgba(192, 132, 252, 0.18)',
            border: 'rgba(216, 180, 254, 0.8)',
            text: '#ffffff',
            glow: 'rgba(168, 85, 247, 0.9)'
        }
    ];

    const pointer = {
        x: width / 2,
        y: height / 2,
        prevX: width / 2,
        prevY: height / 2,
        vx: 0,
        vy: 0,
        speed: 0,
        hasMoved: false,
        lastTime: performance.now()
    };

    const tiles = [];
    const splashes = [];
    const MAX_TILES = 180;

    class GlyphTile {
        constructor(x, y, vx, vy, isSplash = false) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            this.palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
            this.size = isSplash ? (Math.random() * 12 + 18) : (Math.random() * 8 + 16);
            this.rotation = (Math.random() - 0.5) * 0.5;
            this.vRot = (Math.random() - 0.5) * 0.05;
            this.life = 0;
            this.maxLife = isSplash ? (Math.random() * 45 + 50) : (Math.random() * 35 + 40);
            this.isSplash = isSplash;
            this.opacity = 1;
        }

        update() {
            this.life++;
            this.x += this.vx;
            this.y += this.vy;
            this.rotation += this.vRot;

            // Fluid drag damping + slight gravity/lift
            this.vx *= 0.95;
            this.vy = (this.vy * 0.95) + (this.isSplash ? 0.06 : -0.015);

            const progress = this.life / this.maxLife;
            // Smooth ease-out opacity curve
            this.opacity = Math.max(0, 1 - Math.pow(progress, 1.2));
            return this.life < this.maxLife;
        }

        draw(c) {
            c.save();
            c.translate(this.x, this.y);
            c.rotate(this.rotation);
            c.globalAlpha = this.opacity;

            const isMulti = this.char.length > 1;
            const w = this.size * (isMulti ? 1.65 : 1.25);
            const h = this.size * 1.15;
            const r = 5;

            // Liquid tile glass background
            c.fillStyle = this.palette.fill;
            c.shadowColor = this.palette.glow;
            c.shadowBlur = 12;

            c.beginPath();
            if (c.roundRect) {
                c.roundRect(-w / 2, -h / 2, w, h, r);
            } else {
                c.rect(-w / 2, -h / 2, w, h);
            }
            c.fill();

            // Glowing border
            c.strokeStyle = this.palette.border;
            c.lineWidth = 1.2;
            c.stroke();

            // Crisp glyph text
            c.shadowBlur = 6;
            c.fillStyle = this.palette.text;
            c.font = `600 ${Math.round(this.size * 0.62)}px 'Inter', monospace, sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(this.char, 0, 1);

            c.restore();
        }
    }

    class SplashWave {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.radius = 8;
            this.maxRadius = Math.random() * 60 + 80;
            this.opacity = 0.85;
            this.speed = Math.random() * 2.5 + 4.5;
            this.color = Math.random() > 0.4 ? 'rgba(168, 85, 247, ' : 'rgba(56, 189, 248, ';
        }

        update() {
            this.radius += this.speed;
            this.speed *= 0.93;
            this.opacity *= 0.92;
            return this.opacity > 0.02;
        }

        draw(c) {
            c.save();
            c.beginPath();
            c.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            c.strokeStyle = this.color + this.opacity + ')';
            c.lineWidth = 1.8;
            c.shadowColor = '#a855f7';
            c.shadowBlur = 18;
            c.stroke();
            c.restore();
        }
    }

    // Trigger explosive splash on click
    function triggerSplash(x, y) {
        splashes.push(new SplashWave(x, y));
        splashes.push(new SplashWave(x, y));

        const count = Math.floor(Math.random() * 12 + 26); // 26 to 38 glyphs
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.5;
            const speed = Math.random() * 8 + 3;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            tiles.push(new GlyphTile(x, y, vx, vy, true));
        }

        if (tiles.length > MAX_TILES) {
            tiles.splice(0, tiles.length - MAX_TILES);
        }
    }

    // Pointer move stream pouring
    window.addEventListener('pointermove', function(e) {
        const now = performance.now();
        const dt = Math.max(1, now - pointer.lastTime);
        pointer.lastTime = now;

        const curX = e.clientX;
        const curY = e.clientY;

        pointer.vx = (curX - pointer.prevX) / dt * 16;
        pointer.vy = (curY - pointer.prevY) / dt * 16;
        pointer.speed = Math.sqrt(pointer.vx * pointer.vx + pointer.vy * pointer.vy);

        pointer.x = curX;
        pointer.y = curY;
        pointer.prevX = curX;
        pointer.prevY = curY;
        pointer.hasMoved = true;

        // Pour glyph tiles proportional to cursor velocity
        const spawnCount = Math.min(5, Math.floor(pointer.speed / 4) + 1);
        for (let i = 0; i < spawnCount; i++) {
            const jitterX = (Math.random() - 0.5) * 16;
            const jitterY = (Math.random() - 0.5) * 16;
            const liquidLag = (Math.random() * 0.5 + 0.2);
            const vx = -pointer.vx * liquidLag + (Math.random() - 0.5) * 1.5;
            const vy = -pointer.vy * liquidLag + (Math.random() - 0.5) * 1.5;
            tiles.push(new GlyphTile(curX + jitterX, curY + jitterY, vx, vy, false));
        }

        if (tiles.length > MAX_TILES) {
            tiles.splice(0, tiles.length - MAX_TILES);
        }
    }, { passive: true });

    // Click / touch splash handler
    window.addEventListener('pointerdown', function(e) {
        triggerSplash(e.clientX, e.clientY);
    });

    // Ambient floating stream when idle
    let ambientAngle = 0;
    function spawnAmbientStream() {
        ambientAngle += 0.03;
        const orbitX = width / 2 + Math.cos(ambientAngle) * (width * 0.28);
        const orbitY = height / 2 + Math.sin(ambientAngle * 1.4) * (height * 0.22);

        if (!pointer.hasMoved || Math.random() < 0.25) {
            const vx = (Math.random() - 0.5) * 1.2;
            const vy = (Math.random() - 0.5) * 1.2 - 0.4;
            tiles.push(new GlyphTile(orbitX, orbitY, vx, vy, false));
        }

        if (tiles.length > MAX_TILES) {
            tiles.splice(0, tiles.length - MAX_TILES);
        }
    }

    // Connect fluid stream tiles with subtle glowing links
    function drawStreamConnectors(c) {
        c.save();
        for (let i = 0; i < tiles.length; i++) {
            for (let j = i + 1; j < Math.min(i + 4, tiles.length); j++) {
                const t1 = tiles[i];
                const t2 = tiles[j];
                const dx = t1.x - t2.x;
                const dy = t1.y - t2.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 4900) { // < 70px
                    const alpha = (1 - Math.sqrt(distSq) / 70) * Math.min(t1.opacity, t2.opacity) * 0.35;
                    c.beginPath();
                    c.moveTo(t1.x, t1.y);
                    c.lineTo(t2.x, t2.y);
                    c.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
                    c.lineWidth = 1;
                    c.stroke();
                }
            }
        }
        c.restore();
    }

    // Main animation loop
    function animate() {
        // Deep obsidian black trail fade
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(0, 0, width, height);

        spawnAmbientStream();

        // Update & render splash waves
        for (let i = splashes.length - 1; i >= 0; i--) {
            if (splashes[i].update()) {
                splashes[i].draw(ctx);
            } else {
                splashes.splice(i, 1);
            }
        }

        // Draw connective liquid threads
        drawStreamConnectors(ctx);

        // Update & render glyph tiles
        for (let i = tiles.length - 1; i >= 0; i--) {
            if (tiles[i].update()) {
                tiles[i].draw(ctx);
            } else {
                tiles.splice(i, 1);
            }
        }

        requestAnimationFrame(animate);
    }

    // Initial splash greeting
    setTimeout(function() {
        triggerSplash(width / 2, height / 2);
    }, 400);

    animate();
})();
