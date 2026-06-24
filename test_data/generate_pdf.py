#!/usr/bin/env python3
"""Script to generate a test PDF containing text and a RAG architecture diagram image."""

import os
import shutil
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf():
    # Paths
    current_dir = Path(__file__).parent
    brain_dir = Path("/home/deemanth/.gemini/antigravity-ide/brain/672a6bf2-d5ea-4fd3-b2bc-93d20eb77f7f")
    
    # Find generated image
    src_image = None
    for file in brain_dir.glob("rag_diagram_*.png"):
        src_image = file
        break
        
    if not src_image:
        print("❌ Could not find the generated rag_diagram_*.png in brain directory.")
        return
        
    dest_image = current_dir / "rag_diagram.png"
    print(f"Copying {src_image.name} to {dest_image}...")
    shutil.copy2(src_image, dest_image)
    
    pdf_path = current_dir / "rag_architecture_guide.pdf"
    print(f"Generating PDF at {pdf_path}...")
    
    # Setup document
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#1E293B'),
        spaceAfter=15
    )
    
    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=15,
        spaceAfter=10,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155'),
        spaceAfter=10
    )
    
    bullet_style = ParagraphStyle(
        'DocBullet',
        parent=body_style,
        leftIndent=20,
        firstLineIndent=-10,
        spaceAfter=5
    )
    
    caption_style = ParagraphStyle(
        'DocCaption',
        parent=body_style,
        fontName='Helvetica-Oblique',
        fontSize=9,
        leading=12,
        alignment=1, # Center
        textColor=colors.HexColor('#64748B'),
        spaceBefore=5,
        spaceAfter=15
    )
    
    story = []
    
    # Title
    story.append(Paragraph("Retrieval-Augmented Generation (RAG) Architecture Guide", title_style))
    story.append(Paragraph("A Technical Breakdown of Modular Ingestion and Generation Pipelines", caption_style))
    story.append(Spacer(1, 10))
    
    # Introduction
    story.append(Paragraph("Overview", h2_style))
    story.append(Paragraph(
        "Retrieval-Augmented Generation (RAG) is a design pattern that enhances the capabilities of Large Language Models (LLMs) "
        "by grounding their responses in external, vetted data sources. Rather than relying solely on the static weights of the "
        "model, RAG dynamic retrieves relevant text chunks or multimodal elements from a vector store, assemblies them into a "
        "contextual prompt, and feeds them into the generator. This minimizes hallucinations and ensures domain-specific accuracy.",
        body_style
    ))
    
    # Components
    story.append(Paragraph("Key Components", h2_style))
    story.append(Paragraph("A production-ready RAG pipeline consists of the following phases:", body_style))
    story.append(Paragraph("• <b>1. Document Ingestion:</b> Files (PDF, MD, CSV, etc.) are parsed, structured, and chunked into manageable snippets.", bullet_style))
    story.append(Paragraph("• <b>2. Vector Database:</b> Text snippets are converted to dense vector embeddings and stored in indexes (e.g. Qdrant) for fast semantic search.", bullet_style))
    story.append(Paragraph("• <b>3. Query Encoder:</b> User queries are embedded using the same vector space to allow similarity matching.", bullet_style))
    story.append(Paragraph("• <b>4. LLM Generator:</b> The query and top retrieved chunks are merged into a contextual prompt to synthesize a grounded response.", bullet_style))
    
    story.append(Spacer(1, 15))
    
    # Diagram Section
    story.append(Paragraph("Architecture Diagram", h2_style))
    
    # Embed Image (making sure it fits the page width nicely - letter width is 612pt, margins are 54pt each, so printable width is 504pt)
    img_width = 400
    img_height = 400
    r_img = Image(str(dest_image), width=img_width, height=img_height)
    
    story.append(KeepTogether([
        r_img,
        Paragraph("Figure 1: Conceptual Architecture of a Modern Multimodal RAG Pipeline.", caption_style)
    ]))
    
    # Build
    doc.build(story)
    print("✅ PDF successfully built.")

if __name__ == "__main__":
    generate_pdf()
