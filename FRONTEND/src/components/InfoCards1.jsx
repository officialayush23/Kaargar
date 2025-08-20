import React, { useEffect, useRef } from 'react'
import './InfoCards.css'
import tutor from '../assets/images/tutor.png'
import painter from '../assets/images/painter.png'
import plumber from '../assets/images/plumber.png'
import maid from '../assets/images/maid.png'
import electrician from '../assets/images/electrician.png'
import gardener from '../assets/images/gardner.png'
import security from '../assets/images/security.png'
import builder from '../assets/images/builder.png'
import catering from '../assets/images/catering.png'

import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCoverflow, Pagination } from "swiper/modules";

import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/pagination";
import { motion, useScroll, useTransform } from 'motion/react';

import AuroraBackground from './auroraback'
import { Link } from 'react-router-dom'

const InfoCards1 = () => {
  const titleRef = useRef(null);
  const sectionRef = useRef(null);

  const { scrollYProgress: titleProgress } = useScroll({
    target: titleRef,
    offset: ["start end", "end start"]
  });
  const { scrollYProgress: sectionProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"]
  });


  const titleOpacity = useTransform(titleProgress, [0, 0.5], [0, 1]);
  const titleY = useTransform(titleProgress, [0, 0.5], [50, 0]);

  const sectionOpacity = useTransform(sectionProgress, [0, 0.5], [0, 1]);
  const sectionY = useTransform(sectionProgress, [0, 0.5], [50, 0]);


  const professions = [
    { name: "Tutor", img: tutor },
    { name: "Painter", img: painter },
    { name: "Plumber", img: plumber },
    { name: "Maid", img: maid },
    { name: "Electrician", img: electrician },
    { name: "Gardener", img: gardener },
    { name: "Security", img: security },
    { name: "Builder", img: builder },
    { name: "Catering", img: catering }
  ];

  return (
    <>
      <motion.div id="about" ref={titleRef}
        style={{ opacity: titleOpacity, y: titleY, willChange: "opacity, transform" }} className="title-container">
        <h1

          className="title">Hire Any Profession.</h1>
      </motion.div>

      <section ref={sectionRef}
        style={{ opacity: sectionOpacity, y: sectionY, willChange: "opacity, transform" }}
        className='services'>
        <AuroraBackground />
        <div className="container">
          <Swiper
            effect={"coverflow"}
            grabCursor={true}
            centeredSlides={true}
            slidesPerView={"auto"}
            loop={true}
            spaceBetween={90}
            initialSlide={2}
            speed={1000}
            coverflowEffect={{
              rotate: 25,
              stretch: 140,
              depth: 350,
              modifier: 1,
              slideShadows: true,
            }}
            touchRatio={2}
            threshold={5}
            autoplay={{
              delay: 300,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
            }}
            onTouchStart={(swiper) => swiper.autoplay.stop()}  // pause on touch
            onTouchEnd={(swiper) => swiper.autoplay.start()}  // resume after touch

            slideToClickedSlide

            pagination={{ el: ".swiper-pagination", clickable: true }}
            modules={[EffectCoverflow, Pagination, Autoplay]}
            className="swiper-container"
            breakpoints={{
              320: { spaceBetween: 20 },
              640: { spaceBetween: 30 },
              1024: { spaceBetween: 40 },
            }}
          >

            {professions.map((prof, index) => (
              <SwiperSlide className="element" key={index}>
                <div className="holder">
                  <img src={prof.img} alt={prof.name} className="img1" />
                  <Link to="/u_register"><button className="name"><span>Hire {prof.name}</span></button></Link>
                </div>
              </SwiperSlide>
            ))}

            {/* pagination dots container */}
            <div className="swiper-pagination"></div>
          </Swiper>
        </div>
      </section>
    </>
  )
}

export default InfoCards1
