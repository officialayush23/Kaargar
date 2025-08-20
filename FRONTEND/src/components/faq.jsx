import React, { useState } from "react";
import './faq.css';

const faqs = [
  { 
    question: "How do I sign up as a worker?", 
    answer: "Simply download the Kaargar app or register on the website, fill in your details, and verify your identity. Once approved, you can start receiving job requests." 
  },
  { 
    question: "How do I find jobs that match my skills?", 
    answer: "Kaargar matches workers to jobs based on your profile, skills, and location. You’ll receive instant notifications for relevant opportunities." 
  },
  { 
    question: "How do I get paid?", 
    answer: "Payments are processed securely through Kaargar. Once a job is completed and verified, your payment is automatically transferred to your account." 
  },
  { 
    question: "How flexible are the work schedules?", 
    answer: "Kaargar allows you to choose full-time, part-time, or gig-based work. You can accept or decline jobs based on your availability." 
  },
  { 
    question: "Are the employers verified?", 
    answer: "Yes, all employers on Kaargar are verified to ensure safety and trust. You can check ratings and reviews before accepting any job." 
  },
  { 
    question: "How can I track my job history and earnings?", 
    answer: "Your account dashboard provides a complete record of all jobs, earnings, and ratings, so you can track your progress and reputation." 
  },
  { 
    question: "Can I build my reputation on Kaargar?", 
    answer: "Yes! Clients rate and review workers after each job. A higher rating improves your visibility and access to better-paying opportunities." 
  },
  { 
    question: "What if I face an issue with a job or payment?", 
    answer: "Kaargar’s support team is available to resolve disputes, payment issues, or any other concerns promptly." 
  },
  { 
    question: "Is Kaargar safe to use?", 
    answer: "Absolutely. We prioritize the safety of workers by verifying employers, tracking jobs, and providing secure payment systems." 
  },
  { 
    question: "How can I grow my career using Kaargar?", 
    answer: "By completing jobs, receiving good ratings, and gaining experience, you can qualify for higher-paying and more specialized opportunities." 
  },
];

const FAQ = () => {
  const [activeIndex, setActiveIndex] = useState(null);

  const toggleFAQ = (index) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <section id="faq" className="faq-wrapper">
      <h2 className="faq-title">Frequently Asked Questions</h2>
      <div className="faq-container">
        {faqs.map((faq, index) => (
          <div 
            key={index} 
            className={`faq-item ${activeIndex === index ? "active" : ""}`}
            onClick={() => toggleFAQ(index)}
          >
            <div className="faq-question">
              {faq.question}
              <span className="faq-toggle">{activeIndex === index ? "-" : "+"}</span>
            </div>
            {activeIndex === index && <div className="faq-answer">{faq.answer}</div>}
          </div>
        ))}
      </div>
    </section>
  );
};

export default FAQ;
