import React, { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Header.css";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import SideBar from './side_bar'; // Make sure path is correct
import ham from "../assets/images/ham.svg";
// Add your hamburger icon here

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

    return (
        <>
            <nav ref={titleRef} className="navbar">
                <div className="Title">
                    <Link className="nav-txt" to="/">
                        <h1 ref={addToRefs}>Kaargar</h1>
                    </Link>
                </div>

                {/* Desktop Navigation */}
                <div className="option desktop-nav">
                    <Link ref={addToRefs} className="option-txt" to="/User">
                        Want To Hire?
                    </Link>
                    <Link ref={addToRefs} className="option-txt" to="/Worker">
                        Want To Work?
                    </Link>
                </div>

                <div className="nav-container desktop-nav">
                    <Link ref={addToRefs} className="nav-text" to="/U_login">
                        Login
                    </Link>
                    <Link ref={addToRefs} className="nav-text" to="/U_register">
                        SignUp
                    </Link>
                </div>

                {/* Mobile Hamburger */}
                <div className="mobile-nav">
                    <img
                        src={ham}
                        alt="menu"
                        className="hamburger-icon"
                        onClick={() => setIsSidebarOpen(true)}
                    />
                </div>
            </nav>

            {/* Sidebar */}
            {isSidebarOpen && <SideBar close={() => setIsSidebarOpen(false)} />}
        </>
    );
};

export default Header;
