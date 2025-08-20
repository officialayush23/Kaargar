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
    { img: fair, title: "Fair Payments", desc: "Get paid on time with no hidden deductions." },
    { img: flexible, title: "Flexible Schedule", desc: "Work full-time, part-time, or on-demand." },
    { img: skill, title: "Skill-Based Jobs", desc: "Opportunities matched to your skills." },
    { img: verified, title: "Verified Employers", desc: "Trusted, verified employers for safety." },
    { img: instant, title: "Instant Job Alerts", desc: "Never miss a high-paying opportunity." },
    { img: build, title: "Build Your Reputation", desc: "Earn ratings & reviews over time." },
    { img: secure, title: "Secure Payments", desc: "Your earnings are safely transferred every time." },
    { img: career, title: "Career Growth", desc: "Gain experience and higher-paying roles." },
];

const Join = () => {
    

    return (
        <section id="services" className="wrappers">
            <h1 className="tttt">Why Join Us</h1>
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

export default Join;
