import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./Kaarigar.css";

gsap.registerPlugin(ScrollTrigger);

const KaargarTitle = () => {
    const stepRefs = useRef([]);

    const steps = [
        {
            title: "Post Your Job",
            desc: "Tell us what you need – whether it's plumbing, electrical work, painting, or anything else.",
        },
        {
            title: "Kaarigars Bid",
            desc: "Verified skilled workers place their bids on your job. You get options and fair pricing.",
        },
        {
            title: "Choose & Hire",
            desc: "Compare bids, check profiles, and hire the best Kaarigar for your work.",
        },
        {
            title: "Pay Securely",
            desc: "Pay securely through our platform.",
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
        <section className="steps-section">
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

export default KaargarTitle;
