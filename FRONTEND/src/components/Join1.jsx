import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import './join.css';
import fair from '../assets/images/s1 (8).png'
import flexible from '../assets/images/s1 (1).png'
import skill from '../assets/images/s1 (2).png'
import verified from '../assets/images/s1 (3).png'
import instant from '../assets/images/s1 (4).png'
import build from '../assets/images/s1 (5).png'
import secure from '../assets/images/s1 (6).png'
import career from '../assets/images/s1 (7).png'


const cards = [
    { img: fair, title: "Fair Talent", desc: "Access skilled professionals at competitive rates without compromise." },
    { img: flexible, title: "Flexible Hiring", desc: "Hire full-time, part-time, or project-based workers as per your needs." },
    { img: skill, title: "Verified Skills", desc: "Get matched with candidates who have proven skills and experience." },
    { img: verified, title: "Trusted Candidates", desc: "All professionals are verified and background-checked for safety." },
    { img: instant, title: "Instant Access", desc: "Quickly find available talent whenever you need them." },
    { img: build, title: "Build Strong Teams", desc: "Hire consistently to develop high-performing teams." },
    { img: secure, title: "Secure Payments", desc: "Payments are safe, transparent, and reliable for all hires." },
    { img: career, title: "Grow Your Business", desc: "Hire the right people to scale your projects and company efficiently." },
];

const Join1 = () => {


    return (
        <section id="services" className="wrappers">
            <h1 className="tttt">Why Hire From Us</h1>
            <div className="containerj">
                {cards.map((card, index) => {

                    return (
                        <React.Fragment key={index}>
                            {/* Image div */}
                            <div
                                // container for scroll trigger
                                style={{ gridArea: `box${index + 1}` }}
                                className="struct img-div"
                            >
                                <img
                                    // image for stagger
                                    className={`img${index + 1} image`}
                                    src={card.img}
                                    alt={card.title}
                                />
                            </div>

                            {/* Text div */}
                            <div
                                // text for stagger
                                style={{ gridArea: `tbox${index + 1}` }}
                                className="txt-info"
                            >
                                <h2 className="head">{card.title}</h2>
                                <p className="t">{card.desc}</p>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </section>
    );
};

export default Join1;
