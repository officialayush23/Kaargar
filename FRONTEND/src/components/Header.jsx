import React, { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Header.css";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import SideBar from './side_bar';
import ham from "../assets/images/ham.svg";
import { motion, useScroll, useMotionValueEvent } from 'motion/react'
import { NavLink } from "react-router-dom";


const Header = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const titleRef = useRef();
    const headRef = useRef([]);



    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 768) {
                setIsSidebarOpen(false);
            }
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);



    }, []);
    useGSAP(() => {
        gsap.from(titleRef.current, {
            y: 20,
            opacity: 0,
            duration: 1.3,
            ease: "power2.out",
        });

        gsap.from(headRef.current, {
            y: -20,
            opacity: 0,
            duration: 1,
            delay: 1,
            stagger: 0.6,
        });
    }, []);


    const addToRefs = (el) => {
        if (el && !headRef.current.includes(el)) {
            headRef.current.push(el);
        }
    };

    const [hidden, sethidden] = useState(false); // Move this to top

    const { scrollY } = useScroll();
    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious(); // add parentheses
        if (latest > previous && latest > 150) {
            sethidden(true);
        } else {
            sethidden(false);
        }
    });


    return (
        <>
            <motion.nav
    
                role="navigation"
                aria-label="Main Navigation"
                variants={{
                    visible: { y: 0 },

                    hidden: { y: "-150%" },
                }}

                animate={hidden ? "hidden" : "visible"}

                transition={{
                    duration: 0.35, ease: "easeInOut"
                }}



                ref={titleRef} className="navbar ">
                <div className="Title">
                    <Link className="nav-txt" to="/">
                        <h1 className="text-3xl"ref={addToRefs}>Kaargar</h1>
                    </Link>
                </div>

                {/* Desktop Navigation */}
                <div style={{ position: "relative" }} className="option desktop-nav">
                    <NavLink
                        aria-label="Hire workers"

                        ref={addToRefs}
                        className={({ isActive }) => isActive ? "option-txt active" : "option-txt"}
                        to="/"
                    >
                        Want To Hire?
                    </NavLink>
                    <NavLink
                        aria-label="Find work opportunities"
                        ref={addToRefs}

                        className={({ isActive }) => isActive ? "option-txt active" : "option-txt"}
                        to="/Worker"
                    >
                        Want To Work?
                    </NavLink>
                </div>


                <div className="nav-container desktop-nav">
                    <Link aria-label="Login to your account" ref={addToRefs} className="nav-text" to="/login">
                        Login
                    </Link>
                    <Link aria-label="Sign up for a new account" ref={addToRefs} className="nav-text" to="/signup">
                        SignUp
                    </Link>
                </div>

                {/* Mobile Hamburger */}
                <div className="mobile-nav">
                    <img
                        aria-label="Open navigation menu"
                        aria-controls="sidebar-menu"
                        src={ham}
                        alt="menu"
                        className="hamburger-icon"
                        onClick={() => setIsSidebarOpen(true)}
                    />
                </div>
            </motion.nav>

            {/* Sidebar */}
            {isSidebarOpen && <SideBar close={() => setIsSidebarOpen(false)} />}
        </>
    );
};

export default Header;
