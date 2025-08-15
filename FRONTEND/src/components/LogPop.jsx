import React, { useRef, useEffect } from 'react';
import './LogPop.css';
import { Link } from 'react-router-dom';

const LogPop = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        let stars = [];
        const numStars = 100;

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        window.addEventListener("resize", resizeCanvas);
        resizeCanvas();

        for (let i = 0; i < numStars; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 1.5 + 0.5,
                speed: Math.random() * 0.3 + 0.1,
            });
        }

        function animateStars() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let star of stars) {
                // Twinkle effect
                ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 300 + star.x) * 0.5;
                ctx.fillStyle = "white";
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.globalAlpha = 1; // reset

                // Falling movement
                star.y += star.speed;
                if (star.y > canvas.height) {
                    star.y = 0;
                    star.x = Math.random() * canvas.width;
                }
            }

            requestAnimationFrame(animateStars);
        }

        animateStars();

        return () => {
            window.removeEventListener("resize", resizeCanvas);
        };
    }, []);

    return (
        <>
            {/* Canvas as background */}
            <canvas ref={canvasRef} className="stars-bg"></canvas>
             <h1 className="title">KAARGAR</h1>

            {/* Popup */}
            <div className='container'>
               
                <div className="box">
                    <div className="text">
                        <h1 className="head">Welcome To Kaargar</h1>
                        <p className="info">
                            Welcome to the biggest community of workers. From plumbers to tutors.
                        </p>
                        <h2 className="ques">What do you wanna do?</h2>
                        <div className="buttons">
                            <Link className="hire-txt" to='/User'> <button className="hire">Hire</button></Link>
                            <Link className='gethired-txt' to='/Worker'><button className="gethired">Work</button></Link>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default LogPop;
