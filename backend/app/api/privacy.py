from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from uuid import UUID
from app.core.db import session_dep
from app.core.auth import current_user
from app.models.entities import User,Echo,Memory,Connection,Conversation,Membership,Post,Usage,WorldRoom,ChatTurn,KnowledgeDocument
router=APIRouter(prefix='/account',tags=['Account privacy'])
@router.get('/export')
def export_account(user:User=Depends(current_user),db:Session=Depends(session_dep)):
    echoes=db.exec(select(Echo).where(Echo.owner_id==user.id)).all()
    ids=[e.id for e in echoes]
    return {'user':{'id':str(user.id),'email':user.email,'name':user.name,'created_at':user.created_at.isoformat()},'echoes':[e.model_dump(mode='json') for e in echoes],'memories':[m.model_dump(mode='json') for m in db.exec(select(Memory).where(Memory.echo_id.in_(ids))).all()] if ids else [],'connections':[x.model_dump(mode='json') for x in db.exec(select(Connection).where((Connection.requester_id==user.id)|(Connection.recipient_id==user.id))).all()],'conversations':[x.model_dump(mode='json') for x in db.exec(select(Conversation).where((Conversation.requester_id==user.id)|(Conversation.recipient_id==user.id))).all()] ,'knowledge_documents':[d.model_dump(mode='json') for d in db.exec(select(KnowledgeDocument).where(KnowledgeDocument.owner_id==user.id)).all()],'private_chat_history':[x.model_dump(mode='json') for x in db.exec(select(ChatTurn).where(ChatTurn.owner_id==user.id)).all()]}
    return {'user':{'id':str(user.id),'email':user.email,'name':user.name,'created_at':user.created_at.isoformat()},'echoes':[e.model_dump(mode='json') for e in echoes],'memories':[m.model_dump(mode='json') for m in db.exec(select(Memory).where(Memory.echo_id.in_(ids))).all()] if ids else [],'connections':[x.model_dump(mode='json') for x in db.exec(select(Connection).where((Connection.requester_id==user.id)|(Connection.recipient_id==user.id))).all()],'conversations':[x.model_dump(mode='json') for x in db.exec(select(Conversation).where((Conversation.requester_id==user.id)|(Conversation.recipient_id==user.id))).all()],'knowledge_documents':[x.model_dump(mode='json') for x in db.exec(select(KnowledgeDocument).where(KnowledgeDocument.echo_id.in_(ids))).all()] if ids else [],'private_chat_history':[x.model_dump(mode='json') for x in db.exec(select(ChatTurn).where(ChatTurn.owner_id==user.id)).all()]}
