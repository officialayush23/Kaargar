import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./Kaarigar.css";

gsap.registerPlugin(ScrollTrigger);

const Userkaar = () => {
    const stepRefs = useRef([]);

    const steps = [
        {
            title: "Create Your Profile",
            desc: "Sign up and build your professional profile to showcase your skills and experience.",
        },
        {
            title: "Browse Jobs",
            desc: "View available jobs posted by clients that match your skillset and location.",
        },
        {
            title: "Place Your Bid",
            desc: "Submit competitive bids on jobs you want to work on and get noticed by clients.",
        },
        {
            title: "Get Hired & Paid",
            desc: "Once selected, complete the job and receive secure payment through the platform.",
        },
    ];

    useEffect(() => {
        // Timeline for staggered animation of each step
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: ".steps-container",
                start: "top 80%",
                toggleActions: "play none none none",
            }
        });

        stepRefs.current.forEach((el) => {
            tl.from(el, {
                y: 50,
                opacity: 0,
                scale: 0.5,
                duration: 0.8,
            });
        });
    }, []);

    return (
        <section id="info" className="steps-section">
            <h2 className="steps-title">How It Works</h2>
            <div className="steps-container">
                {steps.map((step, i) => (
                    <div
                        key={i}
                        className="step"
                        ref={(el) => (stepRefs.current[i] = el)}
                    >
                        <div className="nos">
                            <span>{i + 1}</span>
                        </div>
                        <div className="content">
                            <h2 className="title1">{step.title}</h2>
                            <span className="desc1">{step.desc}</span>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default Userkaar;
