import React from "react";
import { Link } from "react-router-dom"; // for react-router links
import "./footer.css";

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-container">
                <div className="footer-brand">
                    <h2>Kaargar</h2>
                    <p>Connecting people & services seamlessly.</p>
                </div>

                <div className="footer-links">
                    <div className="footer-column">
                        <h4>Navigation</h4>
                        <a href="#about" className="footer-link">About Us</a>
                        <a href="#services" className="footer-link">Services</a>
                        <a href="#faq" className="footer-link">FAQ</a>
                    </div>

                    <div className="footer-column">
                        <h4>Resources</h4>

                        <a href="mailto:support@kaargar.com">Support</a>
                    </div>

                    <div className="footer-column">
                        <h4>Social</h4>
                        <a href="https://twitter.com" target="_blank" rel="noreferrer">Twitter</a>
                        <a href="https://linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a>
                        <a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram</a>
                    </div>
                </div>
            </div>

            <div className="footer-bottom">
                <p>© {new Date().getFullYear()} Kaargar. All rights reserved.</p>
            </div>
        </footer>
    );
};

export default Footer;
