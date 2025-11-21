import React, { useEffect, useRef } from 'react'
import './Worker.css';
import Header from '../components/Header';
import gsap from 'gsap';
import { ScrollTrigger, TextPlugin, RoughEase } from 'gsap/all';
import { Link } from 'react-router-dom';
import InfoCards from '../components/InfoCards';
import Join from '../components/join';
import FAQ from '../components/faq';
import Footer from '../components/Footer';
import { useLocation } from 'react-router-dom';
import KaargarTitle from '../components/Kaarigar';
import Userkaar from '../components/Userkaar';


const Worker = () => {
  const infoSectionRef = useRef(null);
  const location = useLocation();
  const canvasRef = useRef(null);

  gsap.registerPlugin(ScrollTrigger, TextPlugin, RoughEase);

  // entry animation
  useEffect(() => {
    const words_h1 = ["as a Plumber", "as a Tutor", "as You Want", "with Kaargar"];
    const ctx = gsap.context(() => {
      gsap.to(".cursor", {
        opacity: 0,
        ease: "power2.inOut",
        repeat: -1,
      });

      const Boxtl = gsap.timeline();
      const masterTl = gsap.timeline({ repeat: -1 }).pause();

      Boxtl.to(".box-txt", { duration: 1, width: "fit-content", ease: "power4.inOut" })
        .from(".here", {
          duration: 1,
          y: 2,
          opacity: 0,
          ease: "power3.out",
          onComplete: () => masterTl.play(),
        })
        .to(".here", {
          duration: 2,
          autoAlpha: 0.5,
          yoyo: true,
          repeat: -1,
          ease: "power1.inOut",
        });

      words_h1.forEach((el) => {
        let tl = gsap.timeline({ repeat: 1, yoyo: true, repeatDelay: 1 });
        tl.to(".text", { duration: 1, text: el });
        masterTl.add(tl);
      });
    });

    return () => ctx.revert();
  }, [location.pathname]);

  // canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let stars = [];
    const numStars = 100;
    let animationId;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = 700;
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
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 300 + star.x) * 0.5;
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;

        star.y += star.speed;
        if (star.y > canvas.height) {
          star.y = 0;
          star.x = Math.random() * canvas.width;
        }
      }
      animationId = requestAnimationFrame(animateStars);
    }

    animateStars();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, [location.pathname]);

  return (
    <>
      <main className='wrapper'>
        <canvas ref={canvasRef} className="stars-bg"></canvas>
        <Header />

        <div className="about">
          <div className="info">
            <div className="info-txt">
              <h1 className="txt"><span className="box-txt"></span>
                <span className="here">Work</span><span className="text"></span><span className="cursor">_</span></h1>
              <h2 className="h2-txt">Kaargar connects skilled workers with clients — from students needing quick help to enterprises managing large projects. Reliable, affordable, and fast.</h2>
            </div>
            <div className="bttn">
              <Link className='btn-mi' to='/signup'> <button className="btn-m">Offer Your Skill </button></Link>
              <a href="#info" className="scroll">  <button className="btn">Learn More ⬇︎</button></a>
            </div>
          </div>
        </div>
      </main>

      <Userkaar />

      <InfoCards />
      <Join />
      <FAQ />
      <Footer />
    </>
  )
}

export default Worker;
