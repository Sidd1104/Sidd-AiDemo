'use strict';

/**
 * SHARP AI COSMOS ENGINE
 * Combines:
 * 1. Stars (Static/Twinkling background)
 * 2. Solaris Globe (Fibonacci 3D Point-cloud)
 * 3. Shooting Stars (Random fast streaks)
 */

(function initCosmosEngine() {
    const canvas = document.getElementById('space-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H;
    let stars = [];
    let shoots = [];
    let points = [];

    const numPoints = 1200;
    const globeRadius = 220;
    const fov = 400;

    let angleX = 0;
    let angleY = 0;
    let targetAngleX = 0;
    let targetAngleY = 0;

    class Point3D {
        constructor(i) {
            const phi = Math.acos(-1 + (2 * i) / numPoints);
            const theta = Math.sqrt(numPoints * Math.PI) * phi;
            this.x = globeRadius * Math.cos(theta) * Math.sin(phi);
            this.y = globeRadius * Math.sin(theta) * Math.sin(phi);
            this.z = globeRadius * Math.cos(phi);
        }
        rotate(ax, ay) {
            let cosY = Math.cos(ay), sinY = Math.sin(ay);
            let x1 = this.x * cosY - this.z * sinY;
            let z1 = this.x * sinY + this.z * cosY;
            let cosX = Math.cos(ax), sinX = Math.sin(ax);
            let y1 = this.y * cosX - z1 * sinX;
            let z2 = this.y * sinX + z1 * cosX;
            this.x = x1; this.y = y1; this.z = z2;
        }
    }

    function buildStars() {
        stars = [];
        const n = Math.floor((W * H) / 4000);
        for (let i = 0; i < n; i++) {
            stars.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: Math.random() * 1.2 + 0.2,
                alpha: Math.random() * 0.6 + 0.1,
                twinkle: Math.random() * 0.01 + 0.002,
                dir: Math.random() > 0.5 ? 1 : -1
            });
        }
    }

    function spawnShoot() {
        const startX = Math.random() * W;
        const startY = Math.random() * H * 0.4;
        const angle = (Math.random() * 30 + 15) * (Math.PI / 180);
        const speed = Math.random() * 12 + 8;
        shoots.push({
            x: startX, y: startY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            len: Math.random() * 100 + 50,
            life: 1, decay: Math.random() * 0.03 + 0.01
        });
    }

    let globeOpacity = 1;
    const isHomePage = window.location.pathname === '/' ||
        window.location.pathname.endsWith('index.html') ||
        window.location.pathname === '' ||
        window.location.pathname.endsWith('/');

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
        buildStars();
        points = [];
        for (let i = 0; i < numPoints; i++) points.push(new Point3D(i));
    }

    function animate() {
        ctx.clearRect(0, 0, W, H);

        // Calculate Globe Opacity based on Scroll and Page
        if (!isHomePage) {
            globeOpacity = 0;
        } else {
            const scrollThreshold = 500; // Globe fully fades out by 500px scroll
            globeOpacity = Math.max(0, 1 - (window.scrollY / scrollThreshold));
        }

        // 1. Draw Background Stars
        ctx.fillStyle = '#fff';
        stars.forEach(s => {
            s.alpha += s.twinkle * s.dir;
            if (s.alpha > 0.8 || s.alpha < 0.1) s.dir *= -1;
            ctx.globalAlpha = s.alpha;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        if (globeOpacity > 0) {
            // 2. Draw Globe Glow
            const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, globeRadius * 1.8);
            grad.addColorStop(0, `rgba(255, 180, 0, ${0.05 * globeOpacity})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            // 3. Draw Solaris Globe
            angleX += (targetAngleX - angleX) * 0.05;
            angleY += (targetAngleY - angleY) * 0.05;
            points.sort((a, b) => b.z - a.z);
            for (let p of points) {
                p.rotate(0.001 + angleX, 0.0015 + angleY);

                // Draw point with shared globeOpacity
                const scale = fov / (fov + p.z);
                const x2d = (p.x * scale) + W / 2;
                const y2d = (p.y * scale) + H / 2;
                const baseOpacity = Math.max(0.2, (fov - p.z) / (fov * 1.3));
                const finalOpacity = baseOpacity * globeOpacity;
                const size = Math.max(0.8, scale * 2.2);
                const hue = p.z > -100 ? 25 : 340;
                ctx.fillStyle = `hsla(${hue}, 95%, 75%, ${finalOpacity})`;
                ctx.beginPath();
                ctx.arc(x2d, y2d, size, 0, Math.PI * 2);
                ctx.fill();

                if (p.z > 150) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `hsla(${hue}, 90%, 70%, ${finalOpacity * 0.5})`;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }
        }

        // 4. Draw Shooting Stars
        shoots = shoots.filter(s => s.life > 0);
        shoots.forEach(s => {
            s.x += s.vx; s.y += s.vy; s.life -= s.decay;
            ctx.strokeStyle = `rgba(255,255,255,${s.life})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
            ctx.stroke();
        });

        requestAnimationFrame(animate);
    }

    if (Math.random() > 0.98) spawnShoot();
    setInterval(() => { if (Math.random() > 0.7) spawnShoot(); }, 2000);

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => {
        targetAngleY = (e.clientX - W / 2) * 0.00002;
        targetAngleX = (e.clientY - H / 2) * 0.00002;
    });

    resize();
    animate();
})();
