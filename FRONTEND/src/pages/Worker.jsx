import React, { useEffect, useRef, useState } from 'react'
import './Worker.css';
import Header from '../components/Header';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/all';
import { Timeline } from 'gsap/gsap-core';
import { TextPlugin, RoughEase } from "gsap/all";
import { Link } from 'react-router-dom';
import { Link as ScrollLink } from "react-scroll";
import InfoCards from '../components/InfoCards';
import Join from '../components/join';
import FAQ from '../components/faq';
import Footer from '../components/Footer';





const Worker = () => {
  gsap.registerPlugin(ScrollTrigger);
  gsap.registerPlugin(TextPlugin, RoughEase);
  const canvasRef = useRef(null);
  const titleRef = useRef([]);
  const words_h1 = [
    "as a Plumber",
    "as a Tutor",
    "as You Want",
    "with Kaargar"
  ];


  const title = ["K", "A", "A", "R", "G", "A", "R"];

  // animation for KAARGAr

  useEffect(() => {
    const letters = titleRef.current;

    if (!letters || letters.length === 0) return;

    const infoSection = document.querySelector(".main-container");
    if (!infoSection) return;

    gsap.fromTo(
      letters,
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.3,
        scrollTrigger: {
          trigger: infoSection,
          start: "top top", // animation starts when section is centered
          end: () => "+=" + infoSection.offsetHeight, // pin for full section height

          pin: true,
          scrub: true,
          toggleActions: "play none none reverse",
        },
      }
    );

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    };
  }, []);


  // the entry about animation
  useGSAP(() => {
    gsap.to(".cursor", {
      opacity: 0,
      ease: "power2.inOut",
      repeat: -1,
    });


    const Boxtl = gsap.timeline()

    Boxtl.to('.box-txt', {
      duration: 1, width: "fit-content", ease: "power4.inOut"
    })
      .from('.here', {
        duration: 1,
        y: 2,
        opacity: 0,
        ease: "power3.out", onComplete: () => {
          masterTl.play()
        },
      })
      .to('.here', {
        duration: 2, autoAlpha: 0.5, yoyo: true, repeat: -1, ease: "power1.inOut",
      });
    const masterTl = gsap.timeline({ repeat: -1 }).pause()

    words_h1.forEach(el => {
      let tl = gsap.timeline({ repeat: 1, yoyo: true, repeatDelay: 1 })
      tl.to('.text', {
        duration: 1, text: el
      })
      masterTl.add(tl)
    })

  });















  // canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let stars = [];
    const numStars = 100;

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
      <main className='wrapper'>
        <canvas ref={canvasRef} className="stars-bg"></canvas>
        <Header />

        <div className="about">
          <div className="info">
            <div className="info-txt">
              <h1 className="txt"><span className="box-txt"></span>
                <span className="here">Work </span><span className="text"></span><span className="cursor">_</span></h1>
              <h2 className="h2-txt">Kaargar connects skilled workers with clients — from students needing quick help to enterprises managing large projects. Reliable, affordable, and fast.</h2>
            </div>
            <div className="bttn">

              <Link className='btn-mi' to='/W_register'> <button className="btn-m">Offer Your Skill </button></Link>


              <ScrollLink to="info" smooth={true} duration={500} className="scroll">  <button className="btn">Learn More ⬇︎         </button></ScrollLink>

            </div>
          </div>
          {/* <div className="img-container">
            <img className="img" src={wi1}/>
          </div> */}
        </div>
      </main>
      <section id="info" className='main-container'>
        <h1 className="atitle ">
          {title.map((letter, index) => (
            <span
              key={index}
              ref={(el) => (titleRef.current[index] = el)}
              className="inline-block"
            >
              {letter}
            </span>
          ))}
        </h1>

      </section>
      <InfoCards />
      <Join />
      <FAQ />
      <Footer />



    </>

  )
}

export default Worker
