import React from "react";
import "./side_bar.css";
import Cross from "../assets/images/Cross.png";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Link } from "react-router-dom";

function SideBar({ close }) {
    useGSAP(() => {
        gsap.from(".Hamburger-parent", {
            x: 300,
            opacity: 0,
            duration: 0.5,
            ease: "power1.out",
        });

        gsap.fromTo(
            ".overlay",
            { opacity: 0 },
            { opacity: 1, duration: 0.3, ease: "power1.inOut" }
        );
    }, []);

    return (
        <div>
            {/* Clickable overlay */}
            <div onClick={close} className="overlay"></div>

            {/* Sidebar container */}
            <div className="Hamburger-parent">
                <div className="hamburger-list">
                    <ul className="list-feature">
                        <li className="logo">
                            <img
                                className="Cross"
                                onClick={close}
                                src={Cross}
                                alt="Close menu"
                            />
                        </li>
                        <li className="listings">
                            <Link onClick={close} className="listingsa" to="/User">
                                User
                            </Link>
                        </li>
                        <li className="listings">
                            <Link onClick={close} className="listingsa" to="/Worker">
                                Kaarigar
                            </Link>
                        </li>
                        <li className="listings">
                            <Link onClick={close} className="listingsa" to="/U_login">
                                Login
                            </Link>
                        </li>
                        <li className="listings">
                            <Link onClick={close} className="listingsa" to="/U_register">
                                SignUp
                            </Link>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default SideBar;
